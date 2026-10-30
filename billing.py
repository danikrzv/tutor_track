"""Derived student accounts. Money is allocated only within its original currency."""
from collections import defaultdict


def ledger(records):
    accounts = {}
    def account(student_id, currency):
        key = (student_id, currency)
        if key not in accounts:
            accounts[key] = dict(student_id=student_id, currency=currency, billed=0, received=0, due=0, credit=0, balance=0)
        return accounts[key]

    for s in records['students']:
        account(s['id'],s['currency'])
    direct = defaultdict(int)
    pools = defaultdict(int)
    for p in records['payments']:
        account(p['student_id'],p['currency'])['received'] += p['amount']
        if p['lesson_id']:
            direct[p['lesson_id']] += p['amount']
        else:
            pools[p['student_id'],p['currency']] += p['amount']
    charges = []
    for l in sorted(records['lessons'],key=lambda l:(l['start'],l['id'])):
        if l['status'] != 'completed':
            continue
        a = account(l['student_id'],l['currency'])
        key = (l['student_id'],l['currency'])
        a['billed'] += l['amount']
        paid = direct[l['id']]
        credit = min(max(0,l['amount']-paid),pools[key])
        pools[key] -= credit
        charges.append(dict(l,kind='lesson',total=l['amount'],paid=paid+credit,credit_applied=credit,due=l['amount']-paid-credit,date=l['start']))
    for a in accounts.values():
        a['balance'] = a['billed']-a['received']
        a['due'] = max(0,a['balance'])
        a['credit'] = max(0,-a['balance'])
    return {'accounts':list(accounts.values()),'charges':list(reversed(charges))}
