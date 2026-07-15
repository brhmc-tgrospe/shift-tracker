async function reproduce() {
  // Login as admin/dev
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'sysdev', password: 'password123' })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.error('Login failed', loginData);
    return;
  }
  console.log('Logged in successfully');

  const token = loginData.token;
  
  // Make the PUT request
  const res = await fetch('http://localhost:3001/api/requests/1/admin', {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status: 'accepted' })
  });
  
  console.log('Status:', res.status);
  const data = await res.json().catch(() => null);
  console.log('Response:', data);
}

reproduce().catch(console.error);
