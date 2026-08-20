# Migrations

The `versions/` folder is intentionally empty — generate the first migration once your
DB is up:

```bash
# create the schema migration from the models
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

For a fast hackathon start you can skip Alembic and run `python -m scripts.seed`, which
creates all tables directly and loads demo data. Use Alembic for the "safe to evolve /
scale" story.
