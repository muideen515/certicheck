const fs = require('fs');
const path = require('path');
const sqlFile = fs.readFileSync(path.join('src','db','init.sql'),'utf8');
const statements = sqlFile
  .split(/;\s*(?=(?:[^'"`]*(['"`])[^'"`]*\1)*[^'"`]*$)/m)
  .filter(Boolean)
  .map(stmt => stmt.trim())
  .filter(Boolean);
console.log('STATEMENTS', statements.length);
statements.forEach((s, i) => {
  const preview = s.replace(/\s+/g, ' ').slice(0, 120);
  console.log('---', i + 1, preview.replace(/\n/g, ' '));
  if (s.includes("'")) console.log('  contains quote');
});
