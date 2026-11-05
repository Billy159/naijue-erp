import pathlib,re,runpy,unittest
M=runpy.run_path(str(pathlib.Path(__file__).with_name('deploy-candidate.py')))
class ProxyBudget(unittest.TestCase):
 def test_exact_route_budgets_and_shared_settings(self):
  config=M['nginx_configuration']('naijue-rewrite-fixture-app').decode()
  blocks=dict(re.findall(r'location ([^{}]+) \{([^{}]+)\}',config))
  expected={'/api/products/media/uploads':8388608,'/api/imported-history/sales/revise':4194304,'/api/imported-history/transfers/revise':4194304,'/api/products/commands':1048576,'/api/products/v2/commands':1048576,'/api/catalogue/categories/commands':1048576,'/api/sales/prepare-create':131072,'/api/sales/prepare-existing':131072,'/api/sales/commands':524288,'/api/transfers/prepare-create':131072,'/api/transfers/prepare-existing':131072,'/api/transfers/commands':524288}
  self.assertEqual(set(blocks),{'/','= /api/inventory/output/query'}|{'= '+p for p in expected})
  self.assertIn('client_max_body_size 64k;',config)
  for route,body in blocks.items():
   for directive in ['proxy_connect_timeout 5s;','proxy_send_timeout 30s;','proxy_next_upstream off;','proxy_cache off;','proxy_redirect off;','proxy_set_header Forwarded "";','proxy_set_header X-Forwarded-For "";','proxy_set_header X-Real-IP "";','proxy_set_header X-Forwarded-Host "";','proxy_set_header X-Forwarded-Proto "";','proxy_set_header X-Forwarded-Port "";']:
    self.assertIn(directive,body)
   self.assertIn('proxy_read_timeout %ss;'% (130 if route=='= /api/inventory/output/query' else 30),body)
   if route[2:] in expected:self.assertIn('client_max_body_size %s;'%expected[route[2:]],body)
   else:self.assertNotIn('client_max_body_size',body)
 def test_similar_routes_are_not_expanded(self):
  config=M['nginx_configuration']('naijue-rewrite-fixture-app').decode()
  for route in ['/api/products/','/api/catalogue/colors/commands','/api/catalogue/fits/commands','/api/inventory/query','/api/products/commands/extra','/api/sales/commands/extra','/api/transfers/prepare-create/extra','/api/sales/prepare']:
   self.assertNotIn('location = '+route+' {',config)
  self.assertNotIn('location ~',config)
if __name__=='__main__':unittest.main()
