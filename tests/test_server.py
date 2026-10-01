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

    def test_archive_preserves_history_and_currency_lock(self):
        server.write('settings', {'currency':'EUR'})
        self.lesson()
        with self.assertRaises(ValueError):
            server.write('settings', {'currency':'CHF'})
        server.write('student', {'id':self.student,'name':'Ada','rate':'60','archived':True})
        with self.assertRaises(ValueError):
            self.lesson(start='2026-09-21T10:00')
        self.assertEqual(len(self.get()['lessons']),1)

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
