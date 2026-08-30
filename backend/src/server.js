require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');
const pool = require('./db/connection');

// Routes
const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const verifyRoutes = require('./routes/verify');
const adminRoutes = require('./routes/admin');
const certificateRoutes = require('./routes/certificates');

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
  'file://'
];
app.use(cors({
  origin: function(origin, cb) {
    // allow requests with no origin (e.g. curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// ── HEALTH CHECK ───────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      timestamp: result.rows[0].now,
      message: 'Certicheck backend is running'
    });
  } catch (err) {
    res.status(200).json({
      status: 'degraded',
      message: 'Backend is running, but the database is unavailable',
      error: err.message
    });
  }
});

function callSolanaRpc(method, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const request = https.request({
      hostname: 'api.mainnet-beta.solana.com',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (response.statusCode >= 400 || parsed.error) {
            reject(new Error(parsed.error?.message || 'Solana RPC request failed'));
            return;
          }
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

app.get('/api/network/tps', async (req, res) => {
  try {
    const rpcResponse = await callSolanaRpc('getRecentPerformanceSamples', [10]);
    const samples = rpcResponse.result || [];
    const values = samples.map(sample => {
      const txCount = Number(sample.numTransactions || 0);
      const seconds = Number(sample.samplePeriodSecs || 1);
      return Math.max(0, Math.round(txCount / seconds));
    });

    const currentTps = values[0] || 0;
    const peakTps = values.length ? Math.max(...values) : 0;
    const averageTps = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;

    res.json({
      success: true,
      samples: values,
      currentTps,
      peakTps,
      averageTps,
      updatedAt: new Date().toISOString(),
      meta: {
        cluster: 'mainnet-beta',
        sampleCount: values.length,
        samplePeriodSecs: samples[0]?.samplePeriodSecs || 60
      }
    });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message || 'Unable to fetch Solana TPS data' });
  }
});

// ── ROUTES ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/certificates', certificateRoutes);

// ── 404 HANDLER ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── ERROR HANDLER ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START SERVER ───────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✓ Certicheck backend running on http://localhost:${PORT}`);
    console.log(`✓ Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
