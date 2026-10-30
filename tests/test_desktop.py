"""Real-process checks for the app's ownership and local-server boundary."""
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import tempfile
import unittest
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


class DesktopHostTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.children = []

    def tearDown(self):
        for process in reversed(self.children):
            if process.stdin and not process.stdin.closed:
                process.stdin.close()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            process.stdout.close()
            process.stderr.close()
        self.directory.cleanup()

    def launch(self, port=0, directory=None):
        process = subprocess.Popen([sys.executable,str(ROOT/'desktop'/'host.py'),'--preferred-port',str(port)],
            env={**os.environ,'TUTORTRACK_DATA':directory or self.directory.name},
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.children.append(process)
        self.assertTrue(select.select([process.stdout],[],[],10)[0], 'Host did not announce readiness')
        line = process.stdout.readline()
        if not line:
            self.fail('Host exited before becoming ready: '+process.stderr.read())
        ready = json.loads(line)
        self.assertIn('url',ready)
        return process,ready

    def test_owned_server_serves_app_and_stops_on_parent_disconnect(self):
        process,ready = self.launch()
        self.assertTrue(ready['owned'])
        self.assertTrue(ready['url'].startswith('http://127.0.0.1:'))
        with urlopen(ready['url']+'/api/desktop-health',timeout=3) as response:
            identity = json.load(response)
        self.assertEqual(identity['app'],'TutorTrack')
        with urlopen(ready['url'],timeout=3) as response:
            self.assertIn(b'TutorTrack',response.read())
        process.stdin.close()
        self.assertEqual(process.wait(timeout=8),0)
        with self.assertRaises(OSError):
            urlopen(ready['url'],timeout=1)

    def test_verified_server_is_reused_and_not_stopped_by_second_wrapper(self):
        first,one = self.launch()
        second,two = self.launch(int(one['url'].rsplit(':',1)[1]))
        self.assertEqual(two['url'],one['url'])
        self.assertFalse(two['owned'])
        second.stdin.close()
        self.assertEqual(second.wait(timeout=8),0)
        with urlopen(one['url']+'/api/desktop-health',timeout=3) as response:
            self.assertEqual(response.status,200)

    def test_different_database_is_not_reused(self):
        first,one = self.launch()
        with tempfile.TemporaryDirectory() as other:
            second,two = self.launch(int(one['url'].rsplit(':',1)[1]),other)
            self.assertTrue(two['owned'])
            self.assertNotEqual(two['url'],one['url'])
            second.stdin.close()
            second.wait(timeout=8)
