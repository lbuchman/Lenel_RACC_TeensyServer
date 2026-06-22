'use strict';

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');

const router = express.Router();
const config = require('../utils/config');

// Store file watchers to clean up on disconnect
const watchers = new Map();

/**
 * Stream logs via Server-Sent Events
 * GET /logs/stream
 */
router.get('/stream', cors(), (req, res) => {
  const configuration = config();
  let logFile = configuration.teensyLogFilename || '/home/lbuchman/lenel/teensyLog.log';

  if (!logFile) {
    return res.status(400).json({ error: 'Log file not configured' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Read existing log file
  if (fs.existsSync(logFile)) {
    const fileContent = fs.readFileSync(logFile, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    // Send last 500 lines
    const recentLines = lines.slice(-500);
    recentLines.forEach(line => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`);
    });
  }

  // Watch for new writes to the log file
  let lastSize = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
  let buffer = '';

  const watcher = fs.watch(logFile, (eventType) => {
    if (eventType === 'change') {
      try {
        const currentSize = fs.statSync(logFile).size;
        
        if (currentSize > lastSize) {
          // File grew, read new content
          const fd = fs.openSync(logFile, 'r');
          const newContent = Buffer.alloc(currentSize - lastSize);
          fs.readSync(fd, newContent, 0, currentSize - lastSize, lastSize);
          fs.closeSync(fd);

          buffer += newContent.toString('utf8');
          
          // Split by newlines and send complete lines
          const lines = buffer.split('\n');
          
          // Keep incomplete line in buffer
          buffer = lines.pop() || '';
          
          // Send complete lines
          lines.forEach(line => {
            if (line.trim()) {
              res.write(`data: ${JSON.stringify({ line })}\n\n`);
            }
          });

          lastSize = currentSize;
        } else if (currentSize < lastSize) {
          // File was truncated (cleared)
          lastSize = currentSize;
          buffer = '';
        }
      } catch (err) {
        console.error('Error reading log file:', err);
      }
    }
  });

  // Store watcher for cleanup
  const clientId = `${req.ip}-${Date.now()}`;
  watchers.set(clientId, watcher);

  // Cleanup on disconnect
  req.on('close', () => {
    watcher.close();
    watchers.delete(clientId);
  });

  res.on('error', () => {
    watcher.close();
    watchers.delete(clientId);
  });
});

/**
 * Download the full log file
 * GET /logs/download
 */
router.get('/download', cors(), (req, res) => {
  const configuration = config();
  const logFile = configuration.teensyLogFilename || '/home/lbuchman/lenel/teensyLog.log';

  if (!logFile) {
    return res.status(400).json({ error: 'Log file not configured' });
  }

  if (!fs.existsSync(logFile)) {
    return res.status(404).json({ error: 'Log file not found' });
  }

  return res.download(logFile, path.basename(logFile));
});

/**
 * Get the last N lines of the log file
 * GET /logs/tail?lines=100
 */
router.get('/tail', cors(), (req, res) => {
  const configuration = config();
  let logFile = configuration.teensyLogFilename || '/home/lbuchman/lenel/teensyLog.log';
  const numLines = Math.min(parseInt(req.query.lines || 100, 10), 1000);

  if (!logFile) {
    return res.status(400).json({ error: 'Log file not configured' });
  }

  if (!fs.existsSync(logFile)) {
    return res.json({ lines: [] });
  }

  try {
    const fileContent = fs.readFileSync(logFile, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    const recentLines = lines.slice(-numLines);
    res.json({ lines: recentLines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Clear the log file
 * POST /logs/clear
 */
router.post('/clear', cors(), (req, res) => {
  const configuration = config();
  let logFile = configuration.teensyLogFilename || '/home/lbuchman/lenel/teensyLog.log';

  if (!logFile) {
    return res.status(400).json({ error: 'Log file not configured' });
  }

  try {
    fs.writeFileSync(logFile, `${new Date()}\n`);
    res.json({ success: true, message: 'Log file cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
