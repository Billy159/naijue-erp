"""Static path expressions from actual must-absent guards; no source function execution."""
import ast
from pathlib import Path

def path_expression(node,scope):
 if isinstance(node,ast.Constant):return node.value
 if isinstance(node,ast.Name):return scope[node.id]
 if isinstance(node,ast.Tuple):return tuple(path_expression(n,scope)for n in node.elts)
 if isinstance(node,ast.List):return [path_expression(n,scope)for n in node.elts]
 if isinstance(node,ast.BinOp)and isinstance(node.op,(ast.Div,ast.Add)):
  left,right=path_expression(node.left,scope),path_expression(node.right,scope)
  return left/right if isinstance(node.op,ast.Div)else left+right
 if isinstance(node,ast.Attribute)and node.attr in ('parent','name'):return getattr(path_expression(node.value,scope),node.attr)
 if isinstance(node,ast.Subscript):return path_expression(node.value,scope)[path_expression(node.slice,scope)]
 if isinstance(node,ast.Call):
  args=[path_expression(n,scope)for n in node.args]
  if isinstance(node.func,ast.Name)and node.func.id=='Path':return Path(*args)
  if isinstance(node.func,ast.Attribute)and node.func.attr in ('with_name','values','items'):
   return getattr(path_expression(node.func.value,scope),node.func.attr)(*args)
 raise ValueError('Not a static path expression')

def collect(source,functions,scope):
 tree=ast.parse(source);rows=[]
 def expression(node,env,origin):
  if not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr=='lexists'for n in ast.walk(node)):return
  if isinstance(node,ast.GeneratorExp):
   def visit_generator(index,local):
    if index==len(node.generators):expression(node.elt,local,origin);return
    gen=node.generators[index]
    assert isinstance(gen.target,ast.Name)and not gen.ifs and not gen.is_async
    for value in path_expression(gen.iter,local):visit_generator(index+1,{**local,gen.target.id:value})
   visit_generator(0,dict(env));return
  if isinstance(node,ast.Call)and isinstance(node.func,ast.Attribute)and node.func.attr=='lexists':
   assert ast.unparse(node.func)=='os.path.lexists'and len(node.args)==1
   value=path_expression(node.args[0],env);assert isinstance(value,Path)and value.is_absolute()
   rows.append({'function':origin,'line':node.lineno,'path':str(value),'sourceGuard':ast.unparse(node)});return
  for child in ast.iter_child_nodes(node):expression(child,env,origin)
 def statements(nodes,env,origin):
  local=dict(env)
  for node in nodes:
   if isinstance(node,ast.Assign)and len(node.targets)==1 and isinstance(node.targets[0],ast.Name):
    try:local[node.targets[0].id]=path_expression(node.value,local)
    except (KeyError,ValueError,TypeError):pass
   if isinstance(node,ast.For):
    if not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr=='lexists'for n in ast.walk(node)):continue
    try:values=path_expression(node.iter,local)
    except (KeyError,ValueError,TypeError):continue
    assert isinstance(node.target,ast.Name)
    for value in values:statements(node.body,{**local,node.target.id:value},origin)
   elif isinstance(node,ast.If):
    expression(node.test,local,origin);statements(node.body,local,origin);statements(node.orelse,local,origin)
   elif isinstance(node,(ast.With,ast.Try)):
    statements(node.body,local,origin)
    if isinstance(node,ast.Try):
     for handler in node.handlers:statements(handler.body,local,origin)
     statements(node.finalbody,local,origin)
   elif not isinstance(node,(ast.FunctionDef,ast.ClassDef)):expression(node,local,origin)
 for name in functions:
  function=next(n for n in ast.walk(tree)if isinstance(n,ast.FunctionDef)and n.name==name)
  statements(function.body,scope,name)
 return rows
