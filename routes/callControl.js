const express = require('express');
const router = express.Router();
require('dotenv').config();

const {
  hangupCall,
  makeCall
} = require('../services/callControl.js');

// 3CX 撥打電話
router.post('/makeCall', async function(req, res, next) {
  const {token_3cx, dn, device_id, reason, destination, timeout } = req.body;
  if (!token_3cx || !dn || !device_id || !reason || !destination) {
    return res.status(400).send('Missing required fields');
  }
  try {
    // 進行接通電話
    await makeCall(token_3cx, dn, device_id, reason, destination, timeout = 30);
    res.status(200).send('Request makeCall successfully');
  } catch (error) {
    console.error('Error in POST /makeCall:', error.message);
    return res.status(error.status).send(`Error in POST /makeCall: ${error.message}`);
  }
});

// 3CX 掛斷當前撥號的對象
router.post('/hangup', async function(req, res, next) {
  const {dn, id, token_3cx} = req.body;
  if (!token_3cx || !dn || !id) {
    return res.status(400).send('Missing required fields');
  }
  try {
    // 進行掛斷電話
    await hangupCall(token_3cx, dn, id);
    res.status(200).send('Request hangup successfully');
  } catch (error) {
    console.error('Error in POST /hangup:', error.message);
    return res.status(error.status).send(`Error in POST /hangup: ${error.message}`);
  }
});

module.exports = router;
