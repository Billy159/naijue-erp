"""Joint static history/absence assertions on source paths, never runtime absence evidence."""
from pathlib import Path
import posixpath

def assert_preserved_history(actual,baseline,dispatcher_path,dispatcher_pin):
 for path,pin in baseline.items():
  assert actual.get(path)==(dispatcher_pin if path==dispatcher_path else pin),('HISTORICAL_PATH_OR_PIN_CHANGED',path)

def assert_no_guard_collision(actual_paths,guard_rows):
 collisions=[]
 for value in actual_paths:
  p=Path(value);assert p.is_absolute()and str(p)==posixpath.normpath(str(p))
  for row in guard_rows:
   q=Path(row['path'])
   if p==q or q in p.parents:collisions.append((str(p),str(q),row['function'],row['line']))
 assert not collisions,('EXISTING_PATH_OVERLAPS_ACTUAL_ABSENCE_GUARD',collisions)
