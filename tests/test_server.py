import base64
import io
import json
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class TutorTrackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_data = server.DATA
        server.DATA = Path(self.temp.name)
        server.initialize()
        self.student = server.write('student', {'name':'Ada','rate':'60.00'})['id']

    def tearDown(self):
        server.DATA = self.old_data
        self.temp.cleanup()

    def lesson(self, **changes):
        return server.write('lesson', {'student_id':self.student,'title':'Algebra','start':'2026-09-20T10:00','minutes':60,**changes})['id']

    def pack(self, **changes):
        return server.write('pack', {'student_id':self.student,'name':'Three sessions','quantity':3,'minutes':60,'price':'150',**changes})['id']

    def payment(self, kind, identifier, amount):
        return server.write('payment', {'kind':kind,'id':identifier,'amount':amount,'date':'2026-09-20','method':'Cash'})['id']

    def get(self):
        with server.database() as db:
            return server.state(db)

    def http(self, path, payload=None, **headers):
        handler = object.__new__(server.Handler)
        handler.path = path
        handler.server = SimpleNamespace(server_port=8765)
        handler.headers = {'Host':'127.0.0.1:8765', **headers}
        result = {}
        handler.send = lambda status, body, content_type=None, extra=None: result.update(status=status,body=body,content_type=content_type,extra=extra)
        if payload is None:
            handler.do_GET()
        else:
            body = json.dumps(payload).encode()
            handler.headers.update({'Content-Type':'application/json','Content-Length':str(len(body))})
            handler.rfile = io.BytesIO(body)
            handler.do_POST()
        return result

    def test_hourly_rounding_and_rate_snapshot(self):
        self.lesson(minutes=45,rate='33.33')
        server.write('student', {'id':self.student,'name':'Ada','rate':'99'})
        lesson = self.get()['lessons'][0]
        self.assertEqual(lesson['amount'],2500)
        self.assertEqual(lesson['rate'],3333)

    def test_weekly_lessons_keep_local_time_and_independent_billing(self):
        response = server.write('lesson', {'student_id':self.student,'title':'Weekly maths',
            'start':'2026-10-18T14:30','minutes':60,'repeat_count':4})
        self.assertEqual(response['count'],4)
        self.assertEqual(len(set(response['ids'])),4)
        lessons = self.get()['lessons']
        self.assertEqual([l['start'] for l in lessons],[
            '2026-10-18T14:30','2026-10-25T14:30','2026-11-01T14:30','2026-11-08T14:30'])
        self.assertTrue(all(l['currency']=='CHF' and l['amount']==6000 and l['status']=='scheduled' for l in lessons))
        server.write('lesson-status', {'id':response['ids'][1],'status':'completed'})
        self.payment('lesson',response['ids'][1],'60')
        self.assertEqual([l['status'] for l in self.get()['lessons']],['scheduled','completed','scheduled','scheduled'])

    def test_weekly_conflict_preserves_existing_lesson_and_creates_nothing(self):
        original = self.lesson()
        self.lesson(start='2026-10-04T10:00')
        before = self.get()['lessons']
        with self.assertRaisesRegex(ValueError,'2026-10-04'):
            self.lesson(id=original,title='Changed title',repeat_count=3)
        self.assertEqual(self.get()['lessons'],before)
        with self.assertRaises(ValueError):
            self.lesson(start='2026-09-27T10:00',repeat_count=3)
        self.assertEqual(self.get()['lessons'],before)

    def test_weekly_pack_capacity_is_reserved_atomically(self):
        pack = self.pack(quantity=3)
        with self.assertRaisesRegex(ValueError,'3 available sessions'):
            self.lesson(pack_id=pack,repeat_count=4)
        self.assertEqual(self.get()['lessons'],[])
        self.lesson(pack_id=pack,repeat_count=3)
        self.assertEqual(len(self.get()['lessons']),3)
        self.assertTrue(all(l['amount']==0 and l['pack_id']==pack for l in self.get()['lessons']))
        with self.assertRaises(ValueError):
            self.lesson(pack_id=pack,start='2026-11-01T10:00')

    def test_repeat_existing_lesson_and_count_validation(self):
        original = self.lesson()
        self.lesson(id=original,repeat_count=3)
        self.assertEqual(len(self.get()['lessons']),3)

        self.assertEqual(self.get()['lessons'][0]['id'],original)
        self.lesson(id=original,title='One changed lesson')
        self.assertEqual([l['title'] for l in self.get()['lessons']],['One changed lesson','Algebra','Algebra'])
        for count in (0,53,'invalid',2.5):
            with self.assertRaises(ValueError):
                self.lesson(start='2027-01-01T10:00',repeat_count=count)
        with self.assertRaises(ValueError):
            self.lesson(start='2100-12-31T10:00',repeat_count=2)
        self.assertEqual(len(self.get()['lessons']),3)

    def test_series_edit_changes_only_selected_fields_on_later_planned_lessons(self):
        first = self.lesson(repeat_count=5)
        rows = self.get()['lessons']
        self.assertEqual(len({r['series_id'] for r in rows}),1)
        server.write('lesson-status', {'id':rows[2]['id'],'status':'completed'})
        server.write('lesson-status', {'id':rows[3]['id'],'status':'cancelled'})
        self.lesson(id=rows[4]['id'],start=rows[4]['start'],title='Individual topic',rate='75')
        result = server.write('lesson', {'id':rows[1]['id'],'student_id':self.student,'title':'Algebra',
            'start':'2026-09-27T11:00','minutes':90,'rate':'60','location':'Online','edit_scope':'following'})
        self.assertEqual(result['updated_count'],2)
        updated = self.get()['lessons']
        self.assertEqual(updated[0],rows[0])
        self.assertEqual(updated[2]['start'],rows[2]['start'])
        self.assertEqual(updated[3]['start'],rows[3]['start'])
        self.assertEqual(updated[4]['start'],'2026-10-18T11:00')
        self.assertEqual(updated[4]['title'],'Individual topic')
        self.assertEqual(updated[4]['rate'],7500)
        self.assertEqual(updated[4]['amount'],11250)
        self.assertEqual(updated[4]['location'],'Online')
        self.assertEqual(updated[4]['minutes'],90)

    def test_single_scope_keeps_other_series_lessons_unchanged(self):
        first = self.lesson(repeat_count=3)
        before = self.get()['lessons']
        self.lesson(id=first,title='Only this lesson',edit_scope='single')
        after = self.get()['lessons']
        self.assertEqual(after[1:],before[1:])
        self.assertEqual(after[0]['series_id'],before[0]['series_id'])

    def test_series_conflict_rolls_back_entire_change(self):
        first = self.lesson(repeat_count=3)
        self.lesson(start='2026-10-04T12:00')
        before = self.get()['lessons']
        with self.assertRaises(ValueError):
            self.lesson(id=first,start='2026-09-20T12:00',edit_scope='following')
        self.assertEqual(self.get()['lessons'],before)
        # Shifting onto the series' old slots is allowed because all are moving.
        self.lesson(id=first,start='2026-09-27T10:00',edit_scope='following')
        self.assertEqual(self.get()['lessons'][2]['start'],'2026-10-11T10:00')

    def test_series_pack_capacity_counts_all_targets(self):
        first = self.lesson(repeat_count=3)
        pack = self.pack(quantity=2)
        before = self.get()['lessons']
        with self.assertRaises(ValueError):
            self.lesson(id=first,pack_id=pack,edit_scope='following')
        self.assertEqual(self.get()['lessons'],before)
        enough = self.pack(quantity=3)
        self.lesson(id=first,pack_id=enough,edit_scope='following')
        self.assertTrue(all(l['pack_id']==enough for l in self.get()['lessons']))

    def test_legacy_weekly_series_linking_does_not_group_unrelated_lessons(self):
        first = self.lesson(repeat_count=3)
        other = self.lesson(start='2026-10-11T10:00',title='Different course')
        with server.database() as db:
            db.execute('DROP INDEX idx_lessons_series')
            db.execute('ALTER TABLE lessons DROP COLUMN series_id')
        server.initialize()
        rows = self.get()['lessons']
        self.assertTrue(rows[0]['series_id'])
        self.assertTrue(all(l['series_id']==rows[0]['series_id'] for l in rows[:3]))
        self.assertIsNone(rows[3]['series_id'])
        server.initialize()
        self.assertEqual(self.get()['lessons'],rows)

    def test_lesson_payment_lifecycle(self):
        lesson = self.lesson()
        with self.assertRaises(ValueError):
            self.payment('lesson',lesson,'60')
        server.write('lesson-status', {'id':lesson,'status':'completed'})
        server.write('lesson-status', {'id':lesson,'status':'completed'})
        self.payment('lesson',lesson,'20')
        with self.assertRaises(ValueError):
            self.payment('lesson',lesson,'41')
        self.payment('lesson',lesson,'40')
        with self.assertRaises(ValueError):
            server.write('lesson-status', {'id':lesson,'status':'scheduled'})
        self.assertEqual(sum(p['amount'] for p in self.get()['payments']),6000)
        for p in self.get()['payments']:
            server.write('delete-payment', {'id':p['id']})
        server.write('lesson-status', {'id':lesson,'status':'scheduled'})
        self.assertEqual(self.get()['lessons'][0]['status'],'scheduled')

    def test_pack_reservations_completion_and_cancellation(self):
        pack = self.pack(quantity=1)
        lesson = self.lesson(pack_id=pack)
        with self.assertRaises(ValueError):
            self.lesson(pack_id=pack,start='2026-09-21T10:00')
        server.write('lesson-status', {'id':lesson,'status':'cancelled'})
        second = self.lesson(pack_id=pack,start='2026-09-21T10:00')
        server.write('lesson-status', {'id':second,'status':'completed'})
        server.write('lesson-status', {'id':second,'status':'completed'})
        self.payment('pack',pack,'150')
        with self.assertRaises(ValueError):
            self.payment('lesson',second,'1')
        self.assertEqual(self.get()['lessons'][1]['amount'],0)
        self.assertEqual(len(self.get()['payments']),1)
        with self.assertRaises(ValueError):
            self.lesson(pack_id=pack,start='2026-09-22T10:00')

    def test_pack_must_match_student_and_duration(self):
        pack = self.pack()
        with self.assertRaises(ValueError):
            self.lesson(pack_id=pack,minutes=90)
        other = server.write('student', {'name':'Grace','rate':'80'})['id']
        with self.assertRaises(ValueError):
            self.lesson(pack_id=pack,student_id=other)

    def test_overlap_boundary_and_edit(self):
        first = self.lesson()
        with self.assertRaises(ValueError):
            self.lesson(start='2026-09-20T09:30')
        with self.assertRaises(ValueError):
            self.lesson(start='2026-09-20T10:30')
        self.lesson(start='2026-09-20T11:00')
        self.lesson(id=first,start='2026-09-20T10:00')
        self.assertEqual(len(self.get()['lessons']),2)

    def test_notes_images_backup_and_restore(self):
        lesson = self.lesson()
        note = server.write('note', {'lesson_id':lesson,'title':'Fractions','body':'# Progress\n[[Algebra]]'})['id']
        server.write('note', {'id':note,'lesson_id':lesson,'title':'Fractions','body':'![work](/uploads/test.png)'})
        image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
        upload = self.http('/api/upload', {'data':base64.b64encode(image).decode()})
        self.assertEqual(upload['status'],200)
        backup = self.http('/api/backup')
        self.assertEqual(backup['status'],200)
        with zipfile.ZipFile(io.BytesIO(backup['body'])) as archive:
            self.assertIn(upload['body']['url'].lstrip('/'),archive.namelist())
            with tempfile.TemporaryDirectory() as restored:
                archive.extractall(restored)
                db = sqlite3.connect(Path(restored)/'tutortrack.sqlite3')
                self.assertEqual(db.execute('SELECT student_id FROM notes').fetchone()[0],self.student)
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                db.close()

    def test_validation_and_rollback(self):
        for value in ('NaN','Infinity','-1','1.001'):
            with self.assertRaises(ValueError):
                server.write('student', {'name':'Invalid','rate':value})
        for value in ('oops','2026-09-20T10:00+02:00'):
            with self.assertRaises(ValueError):
                self.lesson(start=value)
        self.assertEqual(len(self.get()['students']),1)
        self.assertEqual(len(self.get()['lessons']),0)

    def test_archive_preserves_history_and_preferred_currency_is_changeable(self):
        server.write('settings', {'currency':'EUR'})
        self.lesson()
        server.write('settings', {'currency':'USD'})
        self.assertEqual(self.get()['settings']['currency'],'USD')
        self.assertEqual(self.get()['lessons'][0]['currency'],'CHF')
        server.write('student', {'id':self.student,'name':'Ada','rate':'60','archived':True})
        with self.assertRaises(ValueError):
            self.lesson(start='2026-09-21T10:00')
        self.assertEqual(len(self.get()['lessons']),1)

    def test_currency_snapshots_survive_student_and_preference_changes(self):
        server.write('student', {'id':self.student,'name':'Ada','rate':'40','currency':'GBP'})
        pack = self.pack()
        lesson = self.lesson()
        server.write('student', {'id':self.student,'name':'Ada','rate':'50','currency':'EUR'})
        server.write('settings', {'currency':'USD'})
        self.lesson(id=lesson,rate='40')
        server.write('lesson-status', {'id':lesson,'status':'completed'})
        self.payment('lesson',lesson,'20')
        self.payment('pack',pack,'100')
        self.lesson(start='2026-09-21T10:00')
        self.lesson(pack_id=pack,start='2026-09-22T10:00')
        state = self.get()
        self.assertEqual([l['currency'] for l in state['lessons']],['GBP','EUR','GBP'])
        self.assertEqual([p['currency'] for p in state['payments']],['GBP','GBP'])
        self.assertEqual(state['packs'][0]['currency'],'GBP')
        self.assertEqual(state['students'][0]['currency'],'EUR')

    def test_currency_validation_and_zero_decimal_money(self):
        for code in ('BOGUS','<script>'):
            with self.assertRaises(ValueError):
                server.write('student', {'name':'Bad','rate':'20','currency':code})
            with self.assertRaises(ValueError):
                server.write('settings', {'currency':code})
        with self.assertRaises(ValueError):
            server.write('student', {'name':'Yen','rate':'20.50','currency':'JPY'})
        server.write('student', {'id':self.student,'name':'Ada','rate':'1001','currency':'JPY'})
        self.lesson(minutes=30)
        self.assertEqual(self.get()['lessons'][0]['amount'],50100)

    def test_exchange_conversion_cross_rates_and_missing_rates(self):
        fx = {'rates':{'EUR':'1','CHF':'0.95','USD':'1.10','JPY':'160'}}
        self.assertEqual(server.converted(11000,'USD','CHF',fx),9500)
        self.assertEqual(server.converted(9500,'CHF','USD',fx),11000)
        self.assertEqual(server.converted(1234,'EUR','JPY',fx),197400)
        self.assertIsNone(server.converted(5000,'GBP','CHF',fx))
        self.assertEqual(server.converted(5000,'GBP','GBP',fx),5000)
        self.assertEqual(server.converted(0,'GBP','CHF',fx),0)

    def test_rates_cached_and_preserved_when_offline_or_invalid(self):
        rows = [{'base':'EUR','quote':code,'date':server.datetime.now().date().isoformat(),'rate':'1.2'}
                for code in server.CURRENCIES if code != 'EUR']
        with patch.object(server,'urlopen',return_value=io.BytesIO(json.dumps(rows).encode())) as request:
            fresh = server.refresh_rates(True)
            self.assertEqual(len(fresh['rates']),len(server.CURRENCIES))
            self.assertEqual(fresh['error'],'')
            cached = server.refresh_rates()
            self.assertEqual(cached['rates'],fresh['rates'])
            self.assertEqual(request.call_count,1)
        with patch.object(server,'urlopen',side_effect=OSError('offline')):
            offline = server.refresh_rates(True)
            self.assertTrue(offline['error'])
            self.assertEqual(offline['rates'],fresh['rates'])
        rows[0]['rate'] = 'NaN'
        with patch.object(server,'urlopen',return_value=io.BytesIO(json.dumps(rows).encode())):
            invalid = server.refresh_rates(True)
            self.assertTrue(invalid['error'])
            self.assertEqual(invalid['rates'],fresh['rates'])

    def test_existing_database_currency_migration_is_safe_and_idempotent(self):
        legacy = Path(self.temp.name)/'legacy'
        legacy.mkdir()
        db = sqlite3.connect(legacy/'tutortrack.sqlite3')
        db.executescript(server.SCHEMA)
        db.execute("UPDATE settings SET value='EUR' WHERE key='currency'")
        db.execute("INSERT INTO students(name,rate) VALUES ('Legacy',2500)")
        db.execute("INSERT INTO lessons(student_id,title,start,minutes,rate,amount,status) VALUES (1,'Old','2026-09-20T10:00',60,2500,2500,'completed')")
        db.execute("INSERT INTO payments(lesson_id,amount,date,method) VALUES (1,1000,'2026-09-20','Cash')")
        db.commit()
        db.close()
        server.DATA = legacy
        server.initialize()
        server.initialize()
        state = self.get()
        self.assertEqual(state['students'][0]['currency'],'EUR')
        self.assertEqual(state['lessons'][0]['currency'],'EUR')
        self.assertEqual(state['payments'][0]['currency'],'EUR')
        self.assertEqual(state['payments'][0]['amount'],1000)
        self.assertEqual(len(list(legacy.glob('before-currencies-*.sqlite3'))),1)

    def test_currency_export_keeps_originals_and_conversion_metadata(self):
        server.write('student', {'id':self.student,'name':'Ada','rate':'110','currency':'USD'})
        lesson = self.lesson()
        server.write('lesson-status', {'id':lesson,'status':'completed'})
        self.payment('lesson',lesson,'55')
        with server.database() as db:
            db.executemany('INSERT INTO exchange_rates VALUES (?,?,?)',[('CHF','0.95','2026-10-01'),('USD','1.10','2026-10-01')])
        import csv
        rows = list(csv.DictReader(io.StringIO(self.http('/api/export')['body'].lstrip('\ufeff'))))
        self.assertEqual(rows[0]['Currency'],'USD')
        self.assertEqual(rows[0]['Charge'],'110.00')
        self.assertEqual(rows[0]['Converted charge'],'95.00')
        self.assertEqual(rows[1]['Received'],'55.00')
        self.assertEqual(rows[1]['Converted received'],'47.50')
        self.assertEqual(rows[1]['Preferred currency'],'CHF')
        self.assertEqual(rows[1]['Rate dates'],'2026-10-01')

    def test_local_request_protection_and_image_validation(self):
        self.assertEqual(self.http('/api/state', Host='attacker.example')['status'],403)
        self.assertEqual(self.http('/api/state', Origin='https://attacker.example')['status'],403)
        self.assertEqual(self.http('/api/state', **{'Sec-Fetch-Site':'cross-site'})['status'],403)
        self.assertEqual(self.http('/../server.py')['status'],404)
        self.assertEqual(self.http('/api/upload', {'data':base64.b64encode(b'<svg onload="alert(1)">').decode()})['status'],400)

    def test_export_accounts_without_double_counting_and_csv_injection(self):
        server.write('student', {'id':self.student,'name':'=DANGER()','rate':'60'})
        pack = self.pack()
        bundled = self.lesson(pack_id=pack)
        server.write('lesson-status', {'id':bundled,'status':'completed'})
        individual = self.lesson(start='2026-09-21T10:00')
        server.write('lesson-status', {'id':individual,'status':'completed'})
        self.payment('pack',pack,'150')
        response = self.http('/api/export')
        self.assertEqual(response['status'],200)
        lines = response['body'].splitlines()
        self.assertEqual(len(lines),4)
        self.assertIn("'=DANGER()",response['body'])


if __name__ == '__main__':
    unittest.main()
