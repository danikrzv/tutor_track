"""TutorTrack: a private, dependency-free local tutoring notebook."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import argparse
import base64
import csv
import io
import json
import mimetypes
import os
import sqlite3
import tempfile
import uuid
import zipfile
import threading
import time
from urllib.request import urlopen, Request

CURRENCIES = {
    'CHF':'Swiss franc','EUR':'Euro','USD':'US dollar','GBP':'British pound',
    'CAD':'Canadian dollar','AUD':'Australian dollar','NZD':'New Zealand dollar',
    'PLN':'Polish zloty','CZK':'Czech koruna','DKK':'Danish krone','NOK':'Norwegian krone',
    'SEK':'Swedish krona','RON':'Romanian leu','HUF':'Hungarian forint',
    'JPY':'Japanese yen','KRW':'South Korean won','CNY':'Chinese yuan',
    'HKD':'Hong Kong dollar','SGD':'Singapore dollar','INR':'Indian rupee',
    'BRL':'Brazilian real','MXN':'Mexican peso','ZAR':'South African rand',
    'TRY':'Turkish lira','AED':'UAE dirham','ILS':'Israeli shekel',
    'MYR':'Malaysian ringgit','THB':'Thai baht','PHP':'Philippine peso',
    'IDR':'Indonesian rupiah','UAH':'Ukrainian hryvnia','RUB':'Russian ruble',
}
FX_LOCK = threading.Lock()

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('TUTORTRACK_DATA', ROOT / 'data')).resolve()

SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 rate INTEGER NOT NULL CHECK(rate >= 0), color TEXT NOT NULL DEFAULT 'purple',
 details TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS packs (
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
 name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
 minutes INTEGER NOT NULL CHECK(minutes > 0), price INTEGER NOT NULL CHECK(price >= 0),
 created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
 title TEXT NOT NULL, start TEXT NOT NULL, minutes INTEGER NOT NULL CHECK(minutes > 0),
 rate INTEGER NOT NULL CHECK(rate >= 0), amount INTEGER NOT NULL CHECK(amount >= 0),
 status TEXT NOT NULL CHECK(status IN ('scheduled','completed','cancelled')),
 pack_id INTEGER REFERENCES packs(id), location TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS payments (
 id INTEGER PRIMARY KEY, lesson_id INTEGER REFERENCES lessons(id), pack_id INTEGER REFERENCES packs(id),
 amount INTEGER NOT NULL CHECK(amount > 0), date TEXT NOT NULL, method TEXT NOT NULL,
 CHECK((lesson_id IS NULL) != (pack_id IS NULL))
);
CREATE TABLE IF NOT EXISTS notes (
 id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id),
 lesson_id INTEGER UNIQUE REFERENCES lessons(id), title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exchange_rates (
 currency TEXT PRIMARY KEY, rate TEXT NOT NULL, date TEXT NOT NULL
);
INSERT OR IGNORE INTO settings VALUES ('currency','CHF');
INSERT OR IGNORE INTO settings VALUES ('time_format','24');
CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_pack ON lessons(pack_id);
CREATE INDEX IF NOT EXISTS idx_payments_lesson ON payments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_payments_pack ON payments(pack_id);
"""

@contextmanager
def database():
    db = sqlite3.connect(DATA / 'tutortrack.sqlite3', timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()

def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'uploads').mkdir(exist_ok=True)
    with database() as db:
        db.executescript(SCHEMA)
        missing = [table for table in ('students','lessons','packs','payments')
                   if 'currency' not in {r['name'] for r in db.execute(f'PRAGMA table_info({table})')}]
        if missing:
            # Preserve existing records before the one-time currency migration.
            if db.execute('SELECT COUNT(*) FROM students').fetchone()[0]:
                backup = sqlite3.connect(DATA / f'before-currencies-{uuid.uuid4().hex}.sqlite3')
                try:
                    db.backup(backup)
                finally:
                    backup.close()
            db.execute('BEGIN IMMEDIATE')
            original = db.execute("SELECT value FROM settings WHERE key='currency'").fetchone()[0]
            for table in missing:
                db.execute(f"ALTER TABLE {table} ADD COLUMN currency TEXT NOT NULL DEFAULT 'CHF'")
                db.execute(f'UPDATE {table} SET currency=?',(original,))

        if 'series_id' not in {r['name'] for r in db.execute('PRAGMA table_info(lessons)')}:
            db.execute('ALTER TABLE lessons ADD COLUMN series_id TEXT')
            # Older weekly batches were inserted consecutively with identical details.
            previous = None
            key_fields = ('student_id','title','minutes','rate','amount','pack_id','location','currency')
            for item in list(db.execute('SELECT * FROM lessons ORDER BY id')):
                current = dict(item)
                if previous and current['id'] == previous['id']+1 and all(current[k] == previous[k] for k in key_fields) and datetime.fromisoformat(current['start'])-datetime.fromisoformat(previous['start']) == timedelta(weeks=1):
                    series = previous.get('series_id') or uuid.uuid4().hex
                    db.execute('UPDATE lessons SET series_id=? WHERE id IN (?,?)',(series,previous['id'],current['id']))
                    current['series_id'] = series
                previous = current
        db.execute('CREATE INDEX IF NOT EXISTS idx_lessons_series ON lessons(series_id)')

def currency_code(value):
    code = str(value).upper()
    if code not in CURRENCIES:
        raise ValueError('Choose one of the supported currencies.')
    return code

def exchange_state(db):
    settings = dict(db.execute('SELECT key,value FROM settings'))
    entries = list(db.execute('SELECT * FROM exchange_rates'))
    return {'base':'EUR', 'rates':{'EUR':'1', **{r['currency']:r['rate'] for r in entries}},
            'dates':{r['currency']:r['date'] for r in entries},
            'checked_at':settings.get('fx_checked_at'), 'error':settings.get('fx_error',''),
            'source':'Frankfurter'}

def refresh_rates(force=False):
    # Only public currency codes leave the computer, never student or payment data.
    with FX_LOCK:
        with database() as db:
            settings = dict(db.execute('SELECT key,value FROM settings'))
            interval = 600 if settings.get('fx_error') else 21600
            if not force and time.time()-float(settings.get('fx_attempt','0')) < interval:
                return exchange_state(db)
        try:
            quotes = ','.join(c.lower() for c in CURRENCIES if c != 'EUR')
            request = Request('https://api.frankfurter.dev/v2/rates?base=eur&quotes='+quotes,
                              headers={'Accept':'application/json','User-Agent':'TutorTrack/1.0'})
            with urlopen(request, timeout=12) as response:
                rows = json.loads(response.read(1_000_000))
            validated = {}
            if not isinstance(rows,list):
                raise ValueError('Invalid rates response')
            for entry in rows:
                code = currency_code(entry['quote'])
                rate = Decimal(str(entry['rate']))
                date = datetime.strptime(entry['date'],'%Y-%m-%d').date()
                if entry['base'] != 'EUR' or not rate.is_finite() or rate <= 0 or date > datetime.now().date()+timedelta(days=1):
                    raise ValueError('Invalid rate')
                validated[code] = (code,str(rate),date.isoformat())
            if set(validated) != set(CURRENCIES)-{'EUR'}:
                raise ValueError('Incomplete rates response')
            with database() as db:
                db.executemany('INSERT INTO exchange_rates VALUES (?,?,?) ON CONFLICT(currency) DO UPDATE SET rate=excluded.rate,date=excluded.date',validated.values())
                db.executemany('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                               [('fx_checked_at',datetime.now().isoformat(timespec='seconds')),('fx_error',''),('fx_attempt',str(time.time()))])
                return exchange_state(db)
        except (OSError,ValueError,KeyError,TypeError,InvalidOperation):
            with database() as db:
                db.executemany('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                               [('fx_error','Could not refresh exchange rates. Cached rates are shown where available.'),('fx_attempt',str(time.time()))])
                return exchange_state(db)

def converted(amount, source, target, fx):
    if source == target or amount == 0:
        return amount
    if source not in fx['rates'] or target not in fx['rates']:
        return None
    value = Decimal(amount)*Decimal(fx['rates'][target])/Decimal(fx['rates'][source])
    unit = Decimal('100') if target in ('JPY','KRW') else Decimal('1')
    return int((value/unit).quantize(Decimal('1'),rounding=ROUND_HALF_UP)*unit)

def required(value, label, limit=300):
    value = str(value or '').strip()
    if not value or len(value) > limit:
        raise ValueError(f'{label} is required (maximum {limit} characters).')
    return value

def integer(value, label, minimum=1, maximum=10000):
    try:
        result = int(value)
        if str(result) != str(value) or not minimum <= result <= maximum:
            raise ValueError()
        return result
    except (ValueError, TypeError):
        raise ValueError(f'{label} must be a whole number from {minimum} to {maximum}.')

def money(value, currency=None):
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > 1000000 or amount.as_tuple().exponent < -2:
            raise ValueError()
        if currency in ('JPY','KRW') and amount != amount.to_integral_value():
            raise ValueError()
        return int(amount * 100)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError('Enter a nonnegative amount with '+('no decimal places.' if currency in ('JPY','KRW') else 'at most two decimal places.'))

def row(db, table, identifier):
    found = db.execute(f'SELECT * FROM {table} WHERE id=?', (identifier,)).fetchone()
    if not found:
        raise ValueError('This record no longer exists. Refresh and try again.')
    return dict(found)

def state(db):
    result = {table: [dict(r) for r in db.execute(f'SELECT * FROM {table} ORDER BY id')] for table in ('students','lessons','packs','payments','notes')}
    result['settings'] = dict(db.execute('SELECT key,value FROM settings'))
    result['currencies'] = CURRENCIES
    result['fx'] = exchange_state(db)
    return result

def save_lesson(db, data, ignore_ids=()):
    result = {}
    old = row(db,'lessons',data['id']) if data.get('id') else None
    if old and old['status'] != 'scheduled':
        raise ValueError('Only scheduled lessons can be edited.')
    student = row(db,'students',data.get('student_id'))
    if student['archived']:
        raise ValueError('Restore this student before scheduling a lesson.')
    minutes = integer(data.get('minutes'),'Duration',5,720)
    try:
        start = datetime.fromisoformat(data.get('start',''))
        if start.tzinfo or start.year < 2000 or start.year > 2100:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('Choose a valid local lesson date and time (2000–2100).')
    start_string = start.isoformat(timespec='minutes')
    repeat_count = integer(data.get('repeat_count',1),'Number of weekly lessons',1,52)
    starts = [start+timedelta(weeks=week) for week in range(repeat_count)]
    if starts[-1].year > 2100:
        raise ValueError('All lessons must be scheduled by the end of 2100.')
    # Compare interval endpoints rather than rounded time slots.
    for lesson in db.execute("SELECT * FROM lessons WHERE status != 'cancelled' AND id != ?", (old['id'] if old else -1,)):
        if lesson['id'] in ignore_ids:
            continue
        other = datetime.fromisoformat(lesson['start'])
        for occurrence in starts:
            difference = (occurrence-other).total_seconds()/60
            if difference < lesson['minutes'] and difference > -minutes:
                raise ValueError(f'The lesson on {occurrence:%Y-%m-%d at %H:%M} overlaps another lesson. No changes were saved. Choose a different time or fewer weeks.')
    pack_id = data.get('pack_id') or None
    if pack_id:
        pack = row(db,'packs',pack_id)
        used = sum(1 for item in db.execute("SELECT id FROM lessons WHERE pack_id=? AND status != 'cancelled' AND id != ?", (pack_id,old['id'] if old else -1)) if item['id'] not in ignore_ids)
        if pack['student_id'] != student['id'] or pack['minutes'] != minutes:
            raise ValueError('The pack must belong to this student and match the lesson duration.')
        if used+repeat_count > pack['quantity']:
            raise ValueError(f'This pack has {pack["quantity"]-used} available sessions, but this schedule needs {repeat_count}. Choose fewer weeks or a different pack.')
    currency = pack['currency'] if pack_id else (old['currency'] if old and old['student_id'] == student['id'] else student['currency'])
    default_rate = old['rate'] if old and old['student_id'] == student['id'] else student['rate']
    rate = 0 if pack_id else money(data.get('rate',str(Decimal(default_rate)/100)),currency)
    amount = 0 if pack_id else int((Decimal(rate)*minutes/60).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    if currency in ('JPY','KRW'):
        amount = int((Decimal(amount)/100).quantize(Decimal('1'),rounding=ROUND_HALF_UP)*100)
    values = (student['id'], required(data.get('title'),'Lesson title'), start_string,minutes,rate,amount,pack_id,str(data.get('location',''))[:300],currency)
    if old:
        db.execute('UPDATE lessons SET student_id=?,title=?,start=?,minutes=?,rate=?,amount=?,pack_id=?,location=?,currency=? WHERE id=?', (*values,old['id']))
        db.execute('UPDATE notes SET student_id=? WHERE lesson_id=?',(student['id'],old['id']))
        result['id'] = old['id']
    else:
        result['id'] = db.execute("INSERT INTO lessons(student_id,title,start,minutes,rate,amount,pack_id,location,currency,status) VALUES (?,?,?,?,?,?,?,?,?,'scheduled')",values).lastrowid
    result['ids'] = [result['id']]
    for occurrence in starts[1:]:
        repeated = (*values[:2],occurrence.isoformat(timespec='minutes'),*values[3:])
        result['ids'].append(db.execute("INSERT INTO lessons(student_id,title,start,minutes,rate,amount,pack_id,location,currency,status) VALUES (?,?,?,?,?,?,?,?,?,'scheduled')",repeated).lastrowid)
    result['count'] = repeat_count
    if repeat_count > 1:
        series = old.get('series_id') if old else None
        series = series or uuid.uuid4().hex
        db.executemany('UPDATE lessons SET series_id=? WHERE id=?',[(series,identifier) for identifier in result['ids']])
    return result

def edit_following_lessons(db, data):
    original = row(db,'lessons',data.get('id'))
    if original['status'] != 'scheduled':
        raise ValueError('Only planned lessons can be edited.')
    if integer(data.get('repeat_count',1),'Number of weekly lessons',1,52) != 1:
        raise ValueError('Edit the existing series separately from adding more weekly lessons.')
    if not original['series_id']:
        return save_lesson(db,data)
    targets = [dict(r) for r in db.execute("SELECT * FROM lessons WHERE series_id=? AND status='scheduled' AND start>=? ORDER BY start,id",(original['series_id'],original['start']))]
    ids = {r['id'] for r in targets}
    # Normalize through the same validation used for individual lessons.
    result = save_lesson(db,data,ids)
    updated = row(db,'lessons',original['id'])
    delta = datetime.fromisoformat(updated['start'])-datetime.fromisoformat(original['start'])
    changes = {key:updated[key] for key in ('student_id','title','minutes','rate','pack_id','location') if updated[key] != original[key]}
    for target in targets:
        if target['id'] == original['id']:
            continue
        payload = {**target,**changes,'repeat_count':1}
        payload['start'] = (datetime.fromisoformat(target['start'])+delta).isoformat(timespec='minutes')
        payload['rate'] = str(Decimal(payload['rate'])/100)
        # A common numeric rate must not silently relabel a different currency.
        if 'rate' in changes and target['currency'] != original['currency'] and 'student_id' not in changes and 'pack_id' not in changes:
            raise ValueError('These lessons use different currencies. Edit their rates individually.')
        save_lesson(db,payload,ids)
    planned = [row(db,'lessons',identifier) for identifier in ids]
    for index,lesson in enumerate(planned):
        start = datetime.fromisoformat(lesson['start'])
        for other in planned[index+1:]:
            difference = (start-datetime.fromisoformat(other['start'])).total_seconds()/60
            if difference < other['minutes'] and difference > -lesson['minutes']:
                raise ValueError('The updated lessons would overlap each other. No changes were saved.')
    for pack_id in {l['pack_id'] for l in planned if l['pack_id']}:
        used = db.execute("SELECT COUNT(*) FROM lessons WHERE pack_id=? AND status!='cancelled'",(pack_id,)).fetchone()[0]
        if used > row(db,'packs',pack_id)['quantity']:
            raise ValueError('The pack does not have enough sessions for all these lessons. No changes were saved.')
    result['updated_count'] = len(ids)
    return result

def write(action, data):
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        result = {}
        if action == 'student':
            old = row(db,'students',data['id']) if data.get('id') else None
            default = old['currency'] if old else db.execute("SELECT value FROM settings WHERE key='currency'").fetchone()[0]
            currency = currency_code(data.get('currency',default))
            values = (required(data.get('name'), 'Name'), str(data.get('subject',''))[:300], str(data.get('email',''))[:300], str(data.get('phone',''))[:100], money(data.get('rate'),currency), data.get('color') if data.get('color') in ('purple','blue','orange','green','pink') else 'purple', str(data.get('details',''))[:10000], int(bool(data.get('archived',False))), currency)
            if data.get('id'):
                row(db,'students',data['id'])
                db.execute('UPDATE students SET name=?,subject=?,email=?,phone=?,rate=?,color=?,details=?,archived=?,currency=? WHERE id=?', (*values, data['id']))
                result['id'] = data['id']
            else:
                result['id'] = db.execute('INSERT INTO students(name,subject,email,phone,rate,color,details,archived,currency) VALUES (?,?,?,?,?,?,?,?,?)', values).lastrowid
        elif action == 'pack':
            student = row(db,'students',data.get('student_id'))
            if student['archived']:
                raise ValueError('Restore this student before adding a pack.')
            result['id'] = db.execute('INSERT INTO packs(student_id,name,quantity,minutes,price,created,currency) VALUES (?,?,?,?,?,?,?)', (student['id'], required(data.get('name'),'Pack name'), integer(data.get('quantity'),'Number of lessons',1,1000), integer(data.get('minutes'),'Duration',5,720), money(data.get('price'),student['currency']), datetime.now().isoformat(timespec='seconds'),student['currency'])).lastrowid
        elif action == 'lesson':
            result = edit_following_lessons(db,data) if data.get('edit_scope') == 'following' else save_lesson(db,data)
        elif action == 'lesson-status':
            lesson = row(db,'lessons',data.get('id'))
            status = data.get('status')
            if status not in ('completed','cancelled','scheduled'):
                raise ValueError('Invalid lesson status.')
            if lesson['status'] == 'cancelled':
                raise ValueError('Schedule a new lesson to replace a cancelled lesson.')
            if lesson['status'] != status:
                if db.execute('SELECT COUNT(*) FROM payments WHERE lesson_id=?',(lesson['id'],)).fetchone()[0]:
                    raise ValueError('A paid lesson cannot be cancelled or reopened. Remove its payment first.')
                db.execute('UPDATE lessons SET status=? WHERE id=?',(status,lesson['id']))
        elif action == 'payment':
            kind = data.get('kind')
            if kind not in ('lesson','pack'):
                raise ValueError('Choose a lesson or pack.')
            item = row(db,'lessons' if kind == 'lesson' else 'packs',data.get('id'))
            if kind == 'lesson' and (item['status'] != 'completed' or item['pack_id']):
                raise ValueError('Only completed, individually billed lessons can receive payments.')
            column = kind+'_id'
            paid = db.execute(f'SELECT COALESCE(SUM(amount),0) FROM payments WHERE {column}=?',(item['id'],)).fetchone()[0]
            due = item['amount' if kind == 'lesson' else 'price']-paid
            amount = money(data.get('amount'),item['currency'])
            if amount <= 0 or amount > due:
                raise ValueError('Payment must be greater than zero and no more than the remaining balance.')
            try:
                date = datetime.strptime(data.get('date',''),'%Y-%m-%d').date().isoformat()
            except (ValueError, TypeError):
                raise ValueError('Choose a valid payment date.')
            result['id'] = db.execute(f'INSERT INTO payments({column},amount,date,method,currency) VALUES (?,?,?,?,?)',(item['id'],amount,date,required(data.get('method'),'Payment method',100),item['currency'])).lastrowid
        elif action == 'delete-payment':
            row(db,'payments',data.get('id'))
            db.execute('DELETE FROM payments WHERE id=?',(data['id'],))
        elif action == 'note':
            student_id = data.get('student_id') or None
            lesson_id = data.get('lesson_id') or None
            if student_id:
                row(db,'students',student_id)
            if lesson_id:
                lesson = row(db,'lessons',lesson_id)
                student_id = lesson['student_id']
            title = required(data.get('title'),'Note title')
            body = str(data.get('body',''))
            if len(body) > 500000:
                raise ValueError('This note is too long.')
            values = (student_id,lesson_id,title,body,datetime.now().isoformat(timespec='seconds'))
            if data.get('id'):
                row(db,'notes',data['id'])
                db.execute('UPDATE notes SET student_id=?,lesson_id=?,title=?,body=?,updated=? WHERE id=?',(*values,data['id']))
                result['id'] = data['id']
            else:
                result['id'] = db.execute('INSERT INTO notes(student_id,lesson_id,title,body,updated) VALUES (?,?,?,?,?)',values).lastrowid
        elif action == 'settings':
            if 'currency' in data:
                currency = currency_code(data['currency'])
                db.execute("UPDATE settings SET value=? WHERE key='currency'",(currency,))
            if 'time_format' in data:
                time_format = str(data['time_format'])
                if time_format not in ('12','24'):
                    raise ValueError('Choose a 12-hour or 24-hour time format.')
                db.execute("INSERT INTO settings(key,value) VALUES ('time_format',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(time_format,))
        else:
            raise ValueError('Unknown action.')
        return result

class Handler(BaseHTTPRequestHandler):
    def send(self, status, body, content_type='application/json', extra=None):
        if isinstance(body,(dict,list)):
            body = json.dumps(body).encode()
        elif isinstance(body,str):
            body = body.encode()
        self.send_response(status)
        self.send_header('Content-Type',content_type)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        for key,value in (extra or {}).items():
            self.send_header(key,value)
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        port = self.server.server_port
        if self.headers.get('Host') not in (f'localhost:{port}',f'127.0.0.1:{port}'):
            self.send(403,{'error':'Use the local TutorTrack address.'})
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://localhost:{port}',f'http://127.0.0.1:{port}'):
            self.send(403,{'error':'Requests must come from TutorTrack.'})
            return False
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.send(403,{'error':'Cross-site requests are not allowed.'})
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        path = self.path.split('?')[0]
        try:
            if path == '/api/state':
                with database() as db:
                    self.send(200,state(db))
            elif path == '/api/backup':
                output = io.BytesIO()
                with tempfile.TemporaryDirectory() as folder:
                    snapshot = Path(folder)/'tutortrack.sqlite3'
                    with database() as source:
                        target = sqlite3.connect(snapshot)
                        try:
                            source.backup(target)
                        finally:
                            target.close()
                    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
                        archive.write(snapshot,'tutortrack.sqlite3')
                        for upload in (DATA/'uploads').iterdir():
                            if upload.is_file():
                                archive.write(upload,'uploads/'+upload.name)
                self.send(200,output.getvalue(),'application/zip',{'Content-Disposition':f'attachment; filename="tutortrack-backup-{datetime.now():%Y-%m-%d}.zip"'})
            elif path == '/api/export':
                with database() as db:
                    records = state(db)
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(['Type','ID','Student','Description','Date','Charge','Received','Currency','Preferred currency','Converted charge','Converted received','Exchange rate','Rate dates'])
                students = {s['id']:s['name'] for s in records['students']}
                currency = records['settings']['currency']
                fx = records['fx']
                def conversion_columns(amount, source, payment=False):
                    value = converted(amount,source,currency,fx)
                    rate = '1' if source == currency else (str(Decimal(fx['rates'][currency])/Decimal(fx['rates'][source])) if source in fx['rates'] and currency in fx['rates'] else '')
                    dates = ' / '.join(sorted({fx['dates'][c] for c in (source,currency) if c in fx['dates']})) if source != currency else ''
                    formatted = f'{value/100:.2f}' if value is not None else ''
                    return [currency,'' if payment else formatted,formatted if payment else '',rate,dates]
                def safe(value):
                    value = str(value)
                    return "'"+value if value.startswith(('=','+','-','@','\t','\r')) else value
                for kind,items in [('lesson',records['lessons']),('pack',records['packs'])]:
                    for item in items:
                        if kind == 'lesson' and (item['status'] != 'completed' or item['pack_id']):
                            continue
                        writer.writerow([kind,item['id'],safe(students[item['student_id']]),safe(item.get('title',item.get('name'))),item.get('start',item.get('created'))[:10],f"{item.get('amount',item.get('price'))/100:.2f}",'',item['currency'],*conversion_columns(item.get('amount',item.get('price')),item['currency'])])
                for payment in records['payments']:
                    kind = 'lesson' if payment['lesson_id'] else 'pack'
                    item = next(i for i in records['lessons' if kind == 'lesson' else 'packs'] if i['id'] == payment[kind+'_id'])
                    writer.writerow(['payment',payment['id'],safe(students[item['student_id']]),safe(payment['method']),payment['date'],'',f"{payment['amount']/100:.2f}",payment['currency'],*conversion_columns(payment['amount'],payment['currency'],True)])
                self.send(200,'\ufeff'+output.getvalue(),'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="tutortrack-accounts.csv"'})
            else:
                if path.startswith('/uploads/'):
                    base = DATA/'uploads'
                    file = (base/path.removeprefix('/uploads/')).resolve()
                else:
                    base = ROOT/'static'
                    file = (base/('index.html' if path == '/' else path.lstrip('/'))).resolve()
                if not file.is_relative_to(base) or not file.is_file():
                    self.send(404,{'error':'Not found'})
                else:
                    self.send(200,file.read_bytes(),mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        except (OSError,sqlite3.Error):
            self.send(500,{'error':'Could not read local data. Check the data folder and try again.'})

    def do_POST(self):
        if not self.allowed():
            return
        try:
            if self.headers.get('Content-Type','').split(';')[0] != 'application/json':
                self.send(415,{'error':'JSON is required.'})
                return
            size = int(self.headers.get('Content-Length','0'))
            if not 0 < size <= 15_000_000:
                raise ValueError('The request is too large (images must be under 10 MB).')
            data = json.loads(self.rfile.read(size))
            if not isinstance(data,dict):
                raise ValueError('Expected an object.')
            if self.path == '/api/upload':
                content = base64.b64decode(data.get('data',''),validate=True)
                if len(content) > 10_000_000:
                    raise ValueError('Choose an image smaller than 10 MB.')
                extension = None
                if content.startswith(b'\x89PNG\r\n\x1a\n'): extension = 'png'
                elif content.startswith(b'\xff\xd8\xff'): extension = 'jpg'
                elif content.startswith((b'GIF87a',b'GIF89a')): extension = 'gif'
                elif content.startswith(b'RIFF') and content[8:12] == b'WEBP': extension = 'webp'
                if not extension:
                    raise ValueError('Choose a PNG, JPEG, GIF or WebP image.')
                name = f'{uuid.uuid4().hex}.{extension}'
                (DATA/'uploads'/name).write_bytes(content)
                self.send(200,{'url':'/uploads/'+name})
            elif self.path == '/api/refresh-rates':
                self.send(200,refresh_rates(force=data.get('force') is True))
            elif self.path.startswith('/api/'):
                self.send(200,write(self.path.removeprefix('/api/'),data))
            else:
                self.send(404,{'error':'Not found'})
        except (ValueError,TypeError,KeyError) as error:
            self.send(400,{'error':str(error)})
        except sqlite3.IntegrityError:
            self.send(400,{'error':'This change conflicts with an existing record. Refresh and try again.'})
        except (OSError,sqlite3.Error):
            self.send(500,{'error':'Could not save local data. Your changes have not been saved.'})

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Start TutorTrack locally.')
    parser.add_argument('--port',type=int,default=8765)
    args = parser.parse_args()
    initialize()
    server = ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'TutorTrack is ready at http://127.0.0.1:{args.port}',flush=True)
    print(f'Your database: {DATA / "tutortrack.sqlite3"}',flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
