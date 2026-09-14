import pymysql
from pathlib import Path

env={}
for line in Path('.env').read_text(encoding='utf-8').splitlines():
    line=line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    k,v=line.split('=',1)
    env[k.strip()] = v.strip()

name_to_tag = {
    '苏昕柔': '补差组',
    '张心怡': '补差组',
    '杨梓欣': '补差组',
    '罗诗琪': '补差组',
    '邱烽旺': '补差组',
    '蓝钰钧': '补差组',
    '黄佳睿': '培优组',
    '蔡紫轩': '培优组',
    '江晓晨': '培优组',
    '管紫瑶': '培优组',
    '李倍西': '培优组',
    '温诗琪': '培优组',
    '张钰润': '基础组',
    '丘亿燃': '基础组',
    '黄创烨': '基础组',
    '邱廣宇': '高中组',
    '赖均昊': '高中组',
    '罗围州': '高中组',
    '刘佳欣': '高中组',
}

action_names = list(name_to_tag.keys())

conn = pymysql.connect(
    host=env['NUXT_MYSQL_HOST'],
    port=int(env['NUXT_MYSQL_PORT']),
    user=env['NUXT_MYSQL_USER'],
    password=env['NUXT_MYSQL_PASSWORD'],
    database=env['NUXT_MYSQL_DATABASE'],
    charset='utf8mb4',
    connect_timeout=10,
)

try:
    cur = conn.cursor()

    # Pre-check each name mapping
    cur.execute(
        f"SELECT id, name FROM students WHERE name IN ({','.join(['%s'] * len(action_names))})",
        action_names,
    )
    rows = cur.fetchall()

    found = {name: [] for name in action_names}
    for sid, sname in rows:
        found[sname].append(int(sid))

    missing = [n for n in action_names if not found[n]]
    ambiguous = [n for n, ids in found.items() if len(ids) > 1]
    if missing or ambiguous:
        print('PRECHECK_FAIL')
        if missing:
            print('missing:' + '|'.join(missing))
        if ambiguous:
            print('ambiguous:' + '|'.join(ambiguous))
        raise SystemExit(2)

    assignments = []
    for name, tag in name_to_tag.items():
        assignments.append((found[name][0], tag, name))

    # Apply inserts (idempotent)
    cur.executemany('INSERT IGNORE INTO student_tags (student_id, tag) VALUES (%s, %s)',
                    [(sid, tag) for sid, tag, _ in assignments])
    conn.commit()

    print('OK')
    print('inserted_or_exists', cur.rowcount)
    # print pairs inserted request
    for sid, tag, name in assignments:
        print(f'{name}:{sid}:{tag}')
finally:
    conn.close()
