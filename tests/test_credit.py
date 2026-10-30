from contextlib import closing
import csv
import io
import sqlite3
from test_server import TutorTrackTests
import server


class CreditTests(TutorTrackTests):
    # Avoid inheriting the old-contract tests; use only their fixture helpers.
    def account(self, currency='USD'):
        return next(a for a in self.get()['billing']['accounts'] if a['student_id']==self.student and a['currency']==currency)

    def usd(self):
        server.write('student', {'id':self.student,'name':'Ada','rate':'33','currency':'USD'})

    def test_credit_covers_past_and_future_at_recorded_prices(self):
        self.usd()
        first=self.lesson()
        server.write('lesson-status',{'id':first,'status':'completed'})
        pack=self.pack(price='330',quantity=10)
        self.assertEqual(self.account()['due'],3300)
        payment=self.payment('pack',pack,'330')
        self.assertEqual(self.account()['credit'],29700)
        self.assertEqual(self.account()['due'],0)
        second=self.lesson(start='2026-09-21T10:00',rate='40')
        server.write('lesson-status',{'id':second,'status':'completed'})
        self.assertEqual(self.account()['credit'],25700)
        server.write('delete-payment',{'id':payment})
        self.assertEqual(self.account()['due'],7300)

    def test_partial_oldest_first_and_currency_isolation(self):
        self.usd()
        newer=self.lesson(start='2026-09-21T10:00')
        older=self.lesson()
        for lid in (newer,older): server.write('lesson-status',{'id':lid,'status':'completed'})
        server.write('payment',{'kind':'student','id':self.student,'currency':'USD','amount':'40','date':'2026-09-22','method':'Cash'})
        charges={c['id']:c for c in self.get()['billing']['charges']}
        self.assertEqual(charges[older]['due'],0)
        self.assertEqual(charges[newer]['due'],2600)
        server.write('payment',{'kind':'student','id':self.student,'currency':'EUR','amount':'100','date':'2026-09-22','method':'Cash'})
        self.assertEqual(self.account()['due'],2600)
        self.assertEqual(self.account('EUR')['credit'],10000)
        with self.assertRaises(ValueError): self.payment('lesson',newer,'27')
        self.payment('lesson',newer,'26')
        self.assertEqual(self.account()['due'],0)

    def test_topup_received_is_atomic_and_export_has_no_pack_charge(self):
        self.usd()
        self.pack(price='330',quantity=10,received=True,date='2026-09-22',method='Transfer')
        self.assertEqual(self.account()['credit'],33000)
        records=list(csv.DictReader(io.StringIO(self.http('/api/export')['body'].lstrip('\ufeff'))))
        self.assertEqual(len(records),1)
        self.assertEqual(records[0]['Received'],'330.00')
        with self.assertRaises(ValueError): self.pack(received=True,date='invalid',method='Cash')
        self.assertEqual(len(self.get()['packs']),1)

    def test_completed_legacy_lessons_and_direct_receipts_migrate_together(self):
        self.usd()
        pack=self.pack(price='330',quantity=10)
        bundled=self.lesson()
        direct=self.lesson(start='2026-09-21T10:00',rate='40')
        for lid in (bundled,direct): server.write('lesson-status',{'id':lid,'status':'completed'})
        with server.database() as db:
            db.execute('UPDATE lessons SET pack_id=?,rate=0,amount=0 WHERE id=?',(pack,bundled))
            db.execute('DROP TABLE payments')
            db.execute('CREATE TABLE payments (id INTEGER PRIMARY KEY,lesson_id INTEGER REFERENCES lessons(id),pack_id INTEGER REFERENCES packs(id),amount INTEGER,date TEXT,method TEXT,currency TEXT,CHECK((lesson_id IS NULL)!=(pack_id IS NULL)))')
            db.execute("INSERT INTO payments VALUES (7,NULL,?,33000,'2026-09-22','Cash','USD')",(pack,))
            db.execute("INSERT INTO payments VALUES (8,?,NULL,2000,'2026-09-21','Cash','USD')",(direct,))
        server.initialize()
        state=self.get()
        self.assertEqual(self.account()['credit'],27700)
        self.assertEqual(self.account()['received'],35000)
        self.assertEqual(sum(c['total'] for c in state['billing']['charges']),7300)
        self.assertTrue(all(c['due']==0 for c in state['billing']['charges']))
        self.assertEqual(len(state['payments']),2)
        server.initialize()
        self.assertEqual(self.get(),state)

    def test_lessons_have_no_pack_capacity_or_type(self):
        self.usd()
        pack=self.pack(quantity=1)
        with self.assertRaisesRegex(ValueError,'credit'):
            self.lesson(pack_id=pack)
        self.lesson(repeat_count=4)
        self.assertEqual(len(self.get()['lessons']),4)

    def test_migration_keeps_receipts_and_prices_once(self):
        # Recreate a legacy payment table and legacy pack-linked lesson.
        self.usd()
        pack=self.pack(price='330',quantity=10)
        lid=self.lesson()
        with server.database() as db:
            db.execute('UPDATE lessons SET pack_id=?,rate=0,amount=0 WHERE id=?',(pack,lid))
            db.execute('DROP TABLE payments')
            db.execute('CREATE TABLE payments (id INTEGER PRIMARY KEY,lesson_id INTEGER REFERENCES lessons(id),pack_id INTEGER REFERENCES packs(id),amount INTEGER,date TEXT,method TEXT,currency TEXT,CHECK((lesson_id IS NULL)!=(pack_id IS NULL)))')
            db.execute("INSERT INTO payments VALUES (7,NULL,?,33000,'2026-09-22','Cash','USD')",(pack,))
        server.initialize()
        server.initialize()
        state=self.get()
        self.assertEqual(len(state['payments']),1)
        self.assertEqual(state['payments'][0]['id'],7)
        self.assertEqual(state['lessons'][0]['amount'],3300)
        self.assertIsNone(state['lessons'][0]['pack_id'])
        self.assertEqual(self.account()['credit'],33000)
        backups=list(server.DATA.glob('before-credit-*.sqlite3'))
        self.assertEqual(len(backups),1)
        with closing(sqlite3.connect(backups[0])) as db:
            self.assertEqual(db.execute('SELECT pack_id FROM lessons').fetchone()[0],pack)

# Only run the new contract cases in this class (base cases remain in test_server).
for name in dir(TutorTrackTests):
    if name.startswith('test_') and name not in CreditTests.__dict__:
        setattr(CreditTests,name,None)
del TutorTrackTests
