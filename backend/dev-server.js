import app from './server.js';

const PORT = process.env.PORT || 1552;

app.listen(PORT, () => {
  console.log(`Genesis server running at http://localhost:${PORT}`);
});
