let count = 0;
const countSpan = document.getElementById('count');
const counterBtn = document.getElementById('counterBtn');
const testFetchBtn = document.getElementById('testFetchBtn');
const fetchResult = document.getElementById('fetchResult');

counterBtn.addEventListener('click', () => {
  count++;
  countSpan.textContent = count;
});

testFetchBtn.addEventListener('click', async () => {
  fetchResult.textContent = 'Fetching /assets/data.json...';
  try {
    const res = await fetch('/assets/data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    fetchResult.innerHTML = `<span style="color:#00ff66;">✓ Success:</span> ${JSON.stringify(data)}`;
  } catch (err) {
    fetchResult.innerHTML = `<span style="color:#ff5555;">✗ Error:</span> ${err.message}`;
  }
});
