# PostgreSQL Migration Guide

This project already supports PostgreSQL through `DATABASE_URL` in Django settings.

Right now, your data lives in the local SQLite file at `backend/backend/db.sqlite3`.
If you move the project to another laptop without that file, products, orders, audits, and users disappear because the database file did not move with the code.

PostgreSQL fixes that by giving you one central database instead of one database file per laptop.

## Recommended Setup

Use one PostgreSQL database on the Fedora machine that will act as the host.

Then:
- Django connects to PostgreSQL
- the frontend still connects to Django
- phones, tablets, and other laptops all see the same data

## 1. Backup your current SQLite data

Run this while your current SQLite setup is still working:

```bash
cd /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend
sh scripts/export_sqlite_data.sh sqlite-export.json
```

That creates a JSON dump you can import into PostgreSQL later.

Optional extra backup:

```bash
cp /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend/backend/db.sqlite3 \
   /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend/db.sqlite3.backup
```

## 2. Install PostgreSQL on Fedora

Run these on your real Fedora machine:

```bash
sudo dnf install -y postgresql-server postgresql
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

## 3. Create the database and user

Example:

```bash
sudo -u postgres psql -c "CREATE USER dalivery WITH PASSWORD 'change-this-password';"
sudo -u postgres psql -c "CREATE DATABASE dalivery_db OWNER dalivery;"
```

## 4. Point Django to PostgreSQL

Add this to `backend/backend/.env`:

```env
DATABASE_URL=postgresql://dalivery:change-this-password@localhost:5432/dalivery_db
```

Keep your existing email and PayMongo variables.

## 5. Install Python dependencies

If needed:

```bash
cd /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend/backend
python3 -m pip install -r requirements.txt
```

## 6. Migrate schema into PostgreSQL

```bash
cd /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend/backend
python3 manage.py migrate
```

## 7. Import your old SQLite data into PostgreSQL

```bash
cd /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend
sh scripts/import_postgres_data.sh sqlite-export.json
```

This works as long as `DATABASE_URL` already exists in `backend/backend/.env`.

If you prefer running it from the shell without editing `.env` first, you can do:

```bash
cd /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend
export DATABASE_URL=postgresql://dalivery:change-this-password@localhost:5432/dalivery_db
sh scripts/import_postgres_data.sh sqlite-export.json
```

Do not `source` the entire `.env` file in the shell because some existing values contain spaces and are not shell-safe.

## 8. Start the backend

```bash
cd /home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend/backend
python3 manage.py runserver 0.0.0.0:8000
```

## 9. Verify the migration

Check these in the app:
- existing admin accounts can still sign in
- products still exist
- order history still exists
- audits still exist
- store open/close status still exists

## Notes

- SQLite is fine for one-machine local development.
- PostgreSQL is better when the project may move across laptops or serve multiple devices reliably.
- The frontend still uses some browser-only storage for cart, checkout draft, and settings cache. PostgreSQL solves the shared server data problem, not every browser-local cache by itself.
