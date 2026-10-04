"""Independent Python reference for the suite engine: every company, FY2023-FY2026.
Writes ref2.json; test_engine2.js checks the JS engine against it."""
import json, math, statistics as st

D = json.load(open('suite_src2.json'))
TAX = 25.17
YRS = ['FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026']
F = ["rev","cogs","gp","opex","ebit","da","ebitda","int","pbt","tax","ni","sga","mie","shB","dpsH","cash","ar","rec",
     "inv","ca","ppe","lti","gw","ta","ap","std","ltd","cl","debt","tl","re","eq","mi","shTot","dacf","cfo","capex","div","issue","fcfSrc"]
cos = {}
for c in D['cos']:
    o = dict(c)
    for f in F:
        o[f] = list(reversed(c[f])) if isinstance(c.get(f), list) else [None] * 5
    o['mcap'] = c['price'] * c['shares']
    cos[c['id']] = o
IND = {x['id']: x for x in D['industries']}

def dv(a, b): return a / b if a is not None and b not in (None, 0) else None
def med(a):
    a = sorted(x for x in a if x is not None)
    return st.median(a) if a else None
def avg(c, f, i): return (c[f][i] + c[f][i - 1]) / 2

def ratios(c, i):
    r = {}
    r['gm'] = c['gp'][i] / c['rev'][i] * 100; r['em'] = c['ebitda'][i] / c['rev'][i] * 100
    r['nm'] = c['ni'][i] / c['rev'][i] * 100; r['ebitm'] = c['ebit'][i] / c['rev'][i] * 100
    ae = avg(c, 'eq', i)
    r['roe'] = c['ni'][i] / ae * 100 if ae > 0 else None
    r['roa'] = c['ni'][i] / avg(c, 'ta', i) * 100
    ce = lambda j: c['ta'][j] - c['cl'][j]
    ic = lambda j: c['eq'][j] + c['mi'][j] + c['debt'][j] - c['cash'][j] - c['lti'][j]
    ace, aic = (ce(i) + ce(i - 1)) / 2, (ic(i) + ic(i - 1)) / 2
    r['roce'] = c['ebit'][i] / ace * 100 if ace > 0 else None
    r['roic'] = c['ebit'][i] * (1 - TAX / 100) / aic * 100 if aic > 0 else None
    r['ato'] = c['rev'][i] / avg(c, 'ta', i); r['fato'] = c['rev'][i] / avg(c, 'ppe', i)
    r['emult'] = avg(c, 'ta', i) / ae
    r['dso'] = c['ar'][i] / c['rev'][i] * 365; r['dio'] = c['inv'][i] / c['cogs'][i] * 365; r['dpo'] = c['ap'][i] / c['cogs'][i] * 365
    r['ccc'] = r['dso'] + r['dio'] - r['dpo']
    r['cur'] = c['ca'][i] / c['cl'][i]; r['quick'] = (c['ca'][i] - c['inv'][i]) / c['cl'][i]
    r['de'] = c['debt'][i] / c['eq'][i] if c['eq'][i] > 0 else None
    r['nde'] = (c['debt'][i] - c['cash'][i]) / c['ebitda'][i] if c['ebitda'][i] > 0 else None
    r['icov'] = c['ebit'][i] / c['int'][i] if c['int'][i] > 0 else None
    r['cconv'] = c['cfo'][i] / c['ebitda'][i] * 100 if c['ebitda'][i] > 0 else None
    r['fcfm'] = (c['cfo'][i] - c['capex'][i]) / c['rev'][i] * 100
    r['nwcp'] = (c['ar'][i] + c['inv'][i] - c['ap'][i]) / c['rev'][i] * 100
    ad = avg(c, 'debt', i)
    r['effr'] = c['int'][i] / ad * 100 if ad > 0 else None
    r['accr'] = (c['ni'][i] - c['cfo'][i]) / avg(c, 'ta', i) * 100
    return r

def altman(c, i, mcap=None, ebit=None):
    ta = c['ta'][i]; ebit = c['ebit'][i] if ebit is None else ebit
    x1 = (c['ca'][i] - c['cl'][i]) / ta; x2 = c['re'][i] / ta; x3 = ebit / ta; x4 = (c['eq'][i] + c['mi'][i]) / c['tl'][i]
    o = {'ems': 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4}
    if mcap is not None:
        o['z'] = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * mcap / c['tl'][i] + 1.0 * c['rev'][i] / ta
    return o

def piot(c, i):
    b = lambda j: c['ta'][j - 1]
    roa = lambda j: c['ni'][j] / b(j); ato = lambda j: c['rev'][j] / b(j); gm = lambda j: c['gp'][j] / c['rev'][j]
    lev = lambda j: c['debt'][j] / ((c['ta'][j] + c['ta'][j - 1]) / 2); cur = lambda j: c['ca'][j] / c['cl'][j]
    t = [roa(i) > 0, c['cfo'][i] > 0, roa(i) > roa(i - 1), c['cfo'][i] / b(i) > roa(i), lev(i) < lev(i - 1),
         cur(i) > cur(i - 1), not (c['issue'][i] > 0), gm(i) > gm(i - 1), ato(i) > ato(i - 1)]
    return sum(t)

PTS = {'icov': [(1, 0), (1.5, 15), (3, 40), (6, 70), (10, 90), (20, 100)], 'nde': [(-0.5, 100), (0, 95), (1, 80), (2, 60), (3, 40), (4, 20), (5, 0)],
       'de': [(0, 100), (0.5, 80), (1, 55), (2, 25), (3, 0)], 'cur': [(0.8, 0), (1, 30), (1.5, 70), (2, 100)],
       'cfod': [(0, 0), (0.2, 40), (0.5, 75), (1, 100)], 'ems': [(3.75, 0), (4.5, 25), (5.65, 55), (6.65, 75), (8.15, 100)]}
W = {'icov': 25, 'nde': 20, 'de': 10, 'cur': 10, 'cfod': 15, 'ems': 20}
def interp(pts, v):
    if v is None: return None
    a = sorted(pts)
    if v <= a[0][0]: return a[0][1]
    if v >= a[-1][0]: return a[-1][1]
    for (x0, y0), (x1, y1) in zip(a, a[1:]):
        if v <= x1: return y0 + (y1 - y0) * (v - x0) / (x1 - x0)
def score(m):
    tot = wt = 0
    for k, w in W.items():
        s = interp(PTS[k], m[k])
        if k == 'cfod' and m['noDebt']: s = 100
        if k == 'icov' and m['icov'] is None: s = 100 if m['noInt'] else 0
        if k == 'nde' and m['nde'] is None: s = 0
        if s is None: continue
        tot += s * w; wt += w
    return tot / wt
def credit(c, i):
    r = ratios(c, i)
    return score({'icov': r['icov'], 'nde': r['nde'], 'de': r['de'], 'cur': r['cur'],
                  'cfod': c['cfo'][i] / c['debt'][i] if c['debt'][i] > 0 else None, 'ems': altman(c, i)['ems'],
                  'noDebt': not c['debt'][i] > 0, 'noInt': not c['int'][i] > 0})
def stress(c, i, cut, bps):
    dE = c['ebitda'][i] * cut / 100; ebit = c['ebit'][i] - dE; ebitda = c['ebitda'][i] - dE
    intr = c['int'][i] + c['debt'][i] * bps / 10000; cfo = c['cfo'][i] - dE - (intr - c['int'][i]); r = ratios(c, i)
    return score({'icov': ebit / intr if intr > 0 else None, 'nde': (c['debt'][i] - c['cash'][i]) / ebitda if ebitda > 0 else None,
                  'de': r['de'], 'cur': r['cur'], 'cfod': cfo / c['debt'][i] if c['debt'][i] > 0 else None,
                  'ems': altman(c, i, ebit=ebit)['ems'], 'noDebt': not c['debt'][i] > 0, 'noInt': not intr > 0})

def beneish(c, i):
    p = i - 1
    dep = lambda j: c['dacf'][j] if c['dacf'][j] and c['dacf'][j] > 0 else c['da'][j]
    sg = lambda j: c['sga'][j] / c['rev'][j] if c['sga'][j] not in (None, 0) and c['sga'][j] > 0 else None
    v = dict(
        dsri=(c['ar'][i] / c['rev'][i]) / (c['ar'][p] / c['rev'][p]) if c['ar'][p] else None,
        gmi=(c['gp'][p] / c['rev'][p]) / (c['gp'][i] / c['rev'][i]) if c['gp'][i] else None,
        aqi=(1 - (c['ca'][i] + c['ppe'][i]) / c['ta'][i]) / (1 - (c['ca'][p] + c['ppe'][p]) / c['ta'][p]),
        sgi=c['rev'][i] / c['rev'][p],
        depi=(dep(p) / (dep(p) + c['ppe'][p])) / (dep(i) / (dep(i) + c['ppe'][i])),
        sgai=sg(i) / sg(p) if sg(i) is not None and sg(p) is not None else 1,
        lvgi=((c['cl'][i] + c['ltd'][i]) / c['ta'][i]) / ((c['cl'][p] + c['ltd'][p]) / c['ta'][p]),
        tata=(c['ni'][i] - c['cfo'][i]) / c['ta'][i])
    for k in v:
        if v[k] is None or not math.isfinite(v[k]): v[k] = 0 if k == 'tata' else 1
    return (-4.84 + 0.920 * v['dsri'] + 0.528 * v['gmi'] + 0.404 * v['aqi'] + 0.892 * v['sgi'] + 0.115 * v['depi']
            - 0.172 * v['sgai'] + 4.679 * v['tata'] - 0.327 * v['lvgi'])

def zmij(c, i):
    x = -4.3 - 4.5 * c['ni'][i] / c['ta'][i] + 5.7 * c['tl'][i] / c['ta'][i] - 0.004 * c['ca'][i] / c['cl'][i]
    return 1 / (1 + math.exp(-x))

def yoy(c, i):
    p = i - 1
    gm = lambda j: c['gp'][j] / c['rev'][j]; ox = lambda j: (c['opex'][j] - c['da'][j]) / c['rev'][j]; em = lambda j: c['ebitda'][j] / c['rev'][j]
    return [(c['rev'][i] - c['rev'][p]) * em(p), c['rev'][i] * (gm(i) - gm(p)), -c['rev'][i] * (ox(i) - ox(p)), c['ebitda'][i] - c['ebitda'][p]]

def headroom(c, i, nde=2.5, icov=3.0, rate=9.0):
    r = rate / 100
    a = nde * c['ebitda'][i] - (c['debt'][i] - c['cash'][i])
    b = (c['ebit'][i] / icov - c['int'][i]) / r if c['ebit'][i] > 0 else -1e18
    return min(a, b)

def dupont_med(c, i, peers):
    rf = ratios(c, i); m = {k: med([ratios(cos[p], i)[k] for p in peers]) for k in ('nm', 'ato', 'emult')}
    if not all(v and v > 0 for v in (rf['nm'], rf['ato'], rf['emult'], m['nm'], m['ato'], m['emult'])): return None
    rF = rf['nm'] * rf['ato'] * rf['emult']; rC = m['nm'] * m['ato'] * m['emult']; L = math.log(rF / rC); gap = rF - rC
    return [gap] + [gap * math.log(rf[k] / m[k]) / L for k in ('nm', 'ato', 'emult')]

def unlev(c, b): return b / (1 + (1 - TAX / 100) * c['debt'][4] / c['mcap'])

out = {}
for ind in D['industries']:
    ids = ind['cos'][:5]
    for cid in ids:
        c = cos[cid]; peers = [x for x in ids if x != cid]; o = {}
        for i in range(1, 5):
            r = ratios(c, i); y = {'r': r, 'ems': altman(c, i)['ems'], 'score': credit(c, i), 'zm': zmij(c, i), 'm': beneish(c, i),
                                   'yoy': yoy(c, i), 'stress': stress(c, i, 20, 200), 'head': headroom(c, i),
                                   'med': {k: med([ratios(cos[p], i)[k] for p in peers]) for k in ('roe', 'dso', 'dio', 'dpo', 'ccc', 'em')},
                                   'dup': dupont_med(c, i, peers)}
            if i >= 2: y['pf'] = piot(c, i)
            o[YRS[i]] = y
        o['z'] = altman(c, 4, c['mcap'])['z']
        ev = c['mcap'] + c['debt'][4] + c['mi'][4] - c['cash'][4] - c.get('cashAdj', 0.0)
        o['pe'] = c['mcap'] / c['ni'][4] if c['ni'][4] > 0 else None
        o['evEbitda'] = ev / c['ebitda'][4] if c['ebitda'][4] > 0 else None
        us = [unlev(cos[p], cos[p]['beta']['adj']) for p in peers if cos[p].get('beta')]
        bu = med(us)
        o['bu'] = bu * (1 + (1 - TAX / 100) * c['debt'][4] / c['mcap']) if bu else None
        o['cagr3'] = ((c['rev'][4] / c['rev'][1]) ** (1 / 3) - 1) * 100
        out[cid] = o
json.dump(out, open('ref2.json', 'w'))
print('reference written for', len(out), 'companies')
# a few headline numbers to eyeball
for cid in ['PRINCEPIPE', 'ASIANPAINT', 'TCS', 'TATASTEEL', 'ATGL']:
    y = out[cid]['FY2026']
    print(cid, 'ROE %.2f' % y['r']['roe'] if y['r']['roe'] is not None else 'ROE n/a', 'score %.1f' % y['score'], 'EMS %.2f' % y['ems'],
          'M %.2f' % y['m'], 'Zm %.3f' % y['zm'], 'PF', y.get('pf'), 'beta', cos[cid]['beta']['adj'])
