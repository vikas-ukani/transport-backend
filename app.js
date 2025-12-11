import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
const app = express();

import apiRouters from './router/api/apiRouters.js';

// Middlewares
const whitelist = [
  '*',
  'http://192.168.0.101:8081',
  '192.168.0.101:8081',
  'http://localhost:8081/',
];
const corsOptions = {
  origin: whitelist,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
};
app.use(cors());
// app.use(cors(corsOptions));

app.use(bodyParser.json());

// Routes
app.use('/api/', apiRouters);

// Assuming you have an upload router in ./router/api/uploadRouter.js
import uploadRouter from './router/uploadRouter.js';
app.use('/uploads', uploadRouter);
// Serve static files from the 'uploads' directory at the root path
app.use('/', express.static('uploads'));

app.get('/', (req, res) => {
  res.json({
    message: `Welcome to the ${process.env.APP_NAME || 'project'} project via nodejs `,
  });
});

// Global error handling middleware (should be last)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

export default app;
