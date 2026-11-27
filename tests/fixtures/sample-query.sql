-- Q3 audit query
SELECT id, email, ssn, last_login_ip
FROM employees
WHERE email = 'alice.smith@acme-corp.com'
  AND ssn = '123-45-6789'
  AND last_login_ip = '192.168.10.45';
