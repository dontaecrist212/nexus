from flask import Flask, request, jsonify, send_from_directory, session
import hashlib
import secrets
import os
from functools import wraps
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'nexus2026secure')
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_HTTPONLY'] = True

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        bio TEXT DEFAULT '',
        theme_color TEXT DEFAULT '#6366f1',
        avatar_emoji TEXT DEFAULT '👤',
        header_song TEXT DEFAULT '',
        location TEXT DEFAULT '',
        website TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#6366f1'")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_emoji TEXT DEFAULT '👤'")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS header_song TEXT DEFAULT ''")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT DEFAULT ''")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT DEFAULT ''")
    cur.execute('''CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        mood TEXT DEFAULT '',
        post_type TEXT DEFAULT 'post',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS mood TEXT DEFAULT ''")
    cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'post'")
    cur.execute('''CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id)
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER NOT NULL,
        following_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS top8 (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        UNIQUE(user_id, position)
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS worlds (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        theme_color TEXT DEFAULT '#6366f1',
        emoji TEXT DEFAULT '🌍',
        creator_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS world_members (
        id SERIAL PRIMARY KEY,
        world_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        UNIQUE(world_id, user_id)
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        location TEXT DEFAULT '',
        event_date TIMESTAMP,
        creator_id INTEGER NOT NULL,
        emoji TEXT DEFAULT '📅',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS event_rsvps (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'going',
        UNIQUE(event_id, user_id)
    )''')
    conn.commit()
    cur.close()
    conn.close()

init_db()

@app.after_request
def add_security_headers(response):
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Not logged in'}), 401
        return f(*args, **kwargs)
    return decorated

def hash_password(password, salt):
    return hashlib.sha256((password + salt).encode()).hexdigest()

def format_user(user):
    return {
        'id': user['id'],
        'username': user['username'],
        'display_name': user.get('display_name') or user['username'],
        'bio': user.get('bio', ''),
        'theme_color': user.get('theme_color', '#6366f1'),
        'avatar_emoji': user.get('avatar_emoji', '👤'),
        'location': user.get('location', ''),
        'website': user.get('website', ''),
        'created_at': str(user.get('created_at', ''))
    }

@app.route('/')
def index():
    return send_from_directory('static', 'nexus_combined.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

@app.route('/api/me')
def me():
    if 'user_id' in session:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id=%s", (session['user_id'],))
        user = cur.fetchone()
        cur.close(); conn.close()
        if user:
            u = format_user(user)
            u['logged_in'] = True
            return jsonify(u)
    return jsonify({'logged_in': False})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')
    display_name = data.get('display_name', '').strip() or username
    if not username or not password:
        return jsonify({'error': 'All fields required'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO users (username, display_name, password_hash, salt) VALUES (%s,%s,%s,%s) RETURNING id",
                   (username, display_name, pw_hash, salt))
        user_id = cur.fetchone()['id']
        conn.commit(); cur.close(); conn.close()
        session['user_id'] = user_id
        session['username'] = username
        return jsonify({'message': 'Account created!', 'username': username}), 201
    except:
        return jsonify({'error': 'Username already taken'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE LOWER(username)=LOWER(%s)", (username,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({'error': 'Invalid username or password'}), 401
    if hash_password(password, user['salt']) != user['password_hash']:
        cur.close(); conn.close()
        return jsonify({'error': 'Invalid username or password'}), 401
    cur.close(); conn.close()
    session['user_id'] = user['id']
    session['username'] = user['username']
    return jsonify({'message': 'Logged in!', 'username': user['username']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})

@app.route('/api/users/<username>')
def get_user(username):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE LOWER(username)=LOWER(%s)", (username,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({'error': 'User not found'}), 404
    u = format_user(user)
    cur.execute("SELECT COUNT(*) as c FROM posts WHERE user_id=%s", (user['id'],))
    u['post_count'] = cur.fetchone()['c']
    cur.execute("SELECT COUNT(*) as c FROM follows WHERE following_id=%s", (user['id'],))
    u['followers'] = cur.fetchone()['c']
    cur.execute("SELECT COUNT(*) as c FROM follows WHERE follower_id=%s", (user['id'],))
    u['following'] = cur.fetchone()['c']
    if 'user_id' in session:
        cur.execute("SELECT id FROM follows WHERE follower_id=%s AND following_id=%s", (session['user_id'], user['id']))
        u['is_following'] = cur.fetchone() is not None
    else:
        u['is_following'] = False
    cur.execute("""SELECT t.position, u.username, u.display_name, u.avatar_emoji, u.theme_color
                   FROM top8 t JOIN users u ON t.friend_id=u.id
                   WHERE t.user_id=%s ORDER BY t.position""", (user['id'],))
    u['top8'] = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify(u)

@app.route('/api/users/<username>/posts')
def get_user_posts(username):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE LOWER(username)=LOWER(%s)", (username,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify([])
    cur.execute("""SELECT p.*, u.username, u.display_name, u.avatar_emoji, u.theme_color,
                   (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as like_count,
                   (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comment_count
                   FROM posts p JOIN users u ON p.user_id=u.id
                   WHERE p.user_id=%s ORDER BY p.created_at DESC LIMIT 50""", (user['id'],))
    posts = [dict(r) for r in cur.fetchall()]
    for post in posts:
        post['created_at'] = str(post['created_at'])
        if 'user_id' in session:
            cur.execute("SELECT id FROM likes WHERE user_id=%s AND post_id=%s", (session['user_id'], post['id']))
            post['liked'] = cur.fetchone() is not None
        else:
            post['liked'] = False
    cur.close(); conn.close()
    return jsonify(posts)

@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    data = request.json
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""UPDATE users SET display_name=%s, bio=%s, theme_color=%s,
                   avatar_emoji=%s, location=%s, website=%s, header_song=%s WHERE id=%s""",
               (data.get('display_name',''), data.get('bio',''), data.get('theme_color','#6366f1'),
                data.get('avatar_emoji','👤'), data.get('location',''), data.get('website',''),
                data.get('header_song',''), session['user_id']))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Profile updated!'})

@app.route('/api/search')
def search_users():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT id, username, display_name, avatar_emoji, theme_color, bio
                   FROM users WHERE LOWER(username) LIKE LOWER(%s) OR LOWER(display_name) LIKE LOWER(%s) LIMIT 20""",
               (f'%{q}%', f'%{q}%'))
    users = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify(users)

@app.route('/api/follow/<int:user_id>', methods=['POST'])
@login_required
def follow(user_id):
    if user_id == session['user_id']:
        return jsonify({'error': 'Cannot follow yourself'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM follows WHERE follower_id=%s AND following_id=%s", (session['user_id'], user_id))
    existing = cur.fetchone()
    if existing:
        cur.execute("DELETE FROM follows WHERE follower_id=%s AND following_id=%s", (session['user_id'], user_id))
        following = False
    else:
        cur.execute("INSERT INTO follows (follower_id, following_id) VALUES (%s,%s)", (session['user_id'], user_id))
        following = True
    conn.commit(); cur.close(); conn.close()
    return jsonify({'following': following})

@app.route('/api/feed')
@login_required
def feed():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT p.*, u.username, u.display_name, u.avatar_emoji, u.theme_color,
                   (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as like_count,
                   (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comment_count
                   FROM posts p JOIN users u ON p.user_id=u.id
                   WHERE p.user_id=%s OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=%s)
                   ORDER BY p.created_at DESC LIMIT 100""", (session['user_id'], session['user_id']))
    posts = [dict(r) for r in cur.fetchall()]
    for post in posts:
        cur.execute("SELECT id FROM likes WHERE user_id=%s AND post_id=%s", (session['user_id'], post['id']))
        post['liked'] = cur.fetchone() is not None
        post['created_at'] = str(post['created_at'])
    cur.close(); conn.close()
    return jsonify(posts)

@app.route('/api/posts', methods=['POST'])
@login_required
def create_post():
    data = request.json
    content = data.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Post cannot be empty'}), 400
    if len(content) > 500:
        return jsonify({'error': 'Post too long (max 500 chars)'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO posts (user_id, content, mood, post_type) VALUES (%s,%s,%s,%s) RETURNING id",
               (session['user_id'], content, data.get('mood',''), data.get('post_type','post')))
    post_id = cur.fetchone()['id']
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Posted!', 'id': post_id}), 201

@app.route('/api/posts/<int:pid>', methods=['DELETE'])
@login_required
def delete_post(pid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM posts WHERE id=%s AND user_id=%s", (pid, session['user_id']))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Deleted'})

@app.route('/api/posts/<int:pid>/like', methods=['POST'])
@login_required
def like_post(pid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM likes WHERE user_id=%s AND post_id=%s", (session['user_id'], pid))
    existing = cur.fetchone()
    if existing:
        cur.execute("DELETE FROM likes WHERE user_id=%s AND post_id=%s", (session['user_id'], pid))
        liked = False
    else:
        cur.execute("INSERT INTO likes (user_id, post_id) VALUES (%s,%s)", (session['user_id'], pid))
        liked = True
    conn.commit()
    cur.execute("SELECT COUNT(*) as c FROM likes WHERE post_id=%s", (pid,))
    count = cur.fetchone()['c']
    cur.close(); conn.close()
    return jsonify({'liked': liked, 'count': count})

@app.route('/api/posts/<int:pid>/comments')
def get_comments(pid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT c.*, u.username, u.display_name, u.avatar_emoji, u.theme_color
                   FROM comments c JOIN users u ON c.user_id=u.id
                   WHERE c.post_id=%s ORDER BY c.created_at ASC""", (pid,))
    comments = [dict(r) for r in cur.fetchall()]
    for c in comments:
        c['created_at'] = str(c['created_at'])
    cur.close(); conn.close()
    return jsonify(comments)

@app.route('/api/posts/<int:pid>/comments', methods=['POST'])
@login_required
def add_comment(pid):
    data = request.json
    content = data.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Comment cannot be empty'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO comments (user_id, post_id, content) VALUES (%s,%s,%s)", (session['user_id'], pid, content))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Commented!'}), 201

@app.route('/api/top8', methods=['POST'])
@login_required
def update_top8():
    data = request.json
    friend_id = data.get('friend_id')
    position = data.get('position')
    conn = get_db()
    cur = conn.cursor()
    if friend_id is None:
        cur.execute("DELETE FROM top8 WHERE user_id=%s AND position=%s", (session['user_id'], position))
    else:
        cur.execute("""INSERT INTO top8 (user_id, friend_id, position) VALUES (%s,%s,%s)
                       ON CONFLICT (user_id, position) DO UPDATE SET friend_id=%s""",
                   (session['user_id'], friend_id, position, friend_id))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Top 8 updated!'})

@app.route('/api/worlds')
def get_worlds():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT w.*, u.username as creator_name,
                   (SELECT COUNT(*) FROM world_members WHERE world_id=w.id) as member_count
                   FROM worlds w JOIN users u ON w.creator_id=u.id
                   ORDER BY member_count DESC LIMIT 50""")
    worlds = [dict(r) for r in cur.fetchall()]
    for w in worlds:
        w['created_at'] = str(w['created_at'])
        if 'user_id' in session:
            cur.execute("SELECT id FROM world_members WHERE world_id=%s AND user_id=%s", (w['id'], session['user_id']))
            w['is_member'] = cur.fetchone() is not None
        else:
            w['is_member'] = False
    cur.close(); conn.close()
    return jsonify(worlds)

@app.route('/api/worlds', methods=['POST'])
@login_required
def create_world():
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'World name required'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO worlds (name, description, theme_color, emoji, creator_id) VALUES (%s,%s,%s,%s,%s) RETURNING id",
               (name, data.get('description',''), data.get('theme_color','#6366f1'), data.get('emoji','🌍'), session['user_id']))
    world_id = cur.fetchone()['id']
    cur.execute("INSERT INTO world_members (world_id, user_id) VALUES (%s,%s)", (world_id, session['user_id']))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'World created!', 'id': world_id}), 201

@app.route('/api/worlds/<int:wid>/join', methods=['POST'])
@login_required
def join_world(wid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM world_members WHERE world_id=%s AND user_id=%s", (wid, session['user_id']))
    existing = cur.fetchone()
    if existing:
        cur.execute("DELETE FROM world_members WHERE world_id=%s AND user_id=%s", (wid, session['user_id']))
        joined = False
    else:
        cur.execute("INSERT INTO world_members (world_id, user_id) VALUES (%s,%s)", (wid, session['user_id']))
        joined = True
    conn.commit(); cur.close(); conn.close()
    return jsonify({'joined': joined})

@app.route('/api/events')
def get_events():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT e.*, u.username as creator_name, u.avatar_emoji as creator_emoji,
                   (SELECT COUNT(*) FROM event_rsvps WHERE event_id=e.id AND status='going') as going_count
                   FROM events e JOIN users u ON e.creator_id=u.id
                   ORDER BY e.event_date ASC NULLS LAST LIMIT 50""")
    events = [dict(r) for r in cur.fetchall()]
    for ev in events:
        ev['event_date'] = str(ev['event_date']) if ev['event_date'] else ''
        ev['created_at'] = str(ev['created_at'])
        if 'user_id' in session:
            cur.execute("SELECT id FROM event_rsvps WHERE event_id=%s AND user_id=%s", (ev['id'], session['user_id']))
            ev['is_going'] = cur.fetchone() is not None
        else:
            ev['is_going'] = False
    cur.close(); conn.close()
    return jsonify(events)

@app.route('/api/events', methods=['POST'])
@login_required
def create_event():
    data = request.json
    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Event title required'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO events (title, description, location, event_date, creator_id, emoji) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
               (title, data.get('description',''), data.get('location',''),
                data.get('event_date') or None, session['user_id'], data.get('emoji','📅')))
    event_id = cur.fetchone()['id']
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Event created!', 'id': event_id}), 201

@app.route('/api/events/<int:eid>/rsvp', methods=['POST'])
@login_required
def rsvp_event(eid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM event_rsvps WHERE event_id=%s AND user_id=%s", (eid, session['user_id']))
    existing = cur.fetchone()
    if existing:
        cur.execute("DELETE FROM event_rsvps WHERE event_id=%s AND user_id=%s", (eid, session['user_id']))
        going = False
    else:
        cur.execute("INSERT INTO event_rsvps (event_id, user_id, status) VALUES (%s,%s,'going')", (eid, session['user_id']))
        going = True
    conn.commit(); cur.close(); conn.close()
    return jsonify({'going': going})

@app.route('/api/explore')
def explore():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT p.*, u.username, u.display_name, u.avatar_emoji, u.theme_color,
                   (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as like_count,
                   (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comment_count
                   FROM posts p JOIN users u ON p.user_id=u.id
                   ORDER BY like_count DESC, p.created_at DESC LIMIT 50""")
    posts = [dict(r) for r in cur.fetchall()]
    for post in posts:
        post['liked'] = False
        if 'user_id' in session:
            cur.execute("SELECT id FROM likes WHERE user_id=%s AND post_id=%s", (session['user_id'], post['id']))
            post['liked'] = cur.fetchone() is not None
        post['created_at'] = str(post['created_at'])
    cur.close(); conn.close()
    return jsonify(posts)

if __name__ == '__main__':
    print("\n✅ NEXUS running at http://localhost:5000\n")
    app.run(debug=True, port=5000)