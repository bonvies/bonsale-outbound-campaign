const express = require('express');
const router = express.Router();

const {
  hangupCall,
} = require('../services/callControl.js');

// 掛斷當前撥號的對象
router.post('/hangup', async function(req, res, next) {
  const {dn, id, token_3cx} = req.body;
  if (!dn || !id) {
    return res.status(400).send('Missing required fields');
  }
  try {
    // 進行掛斷電話
    await hangupCall(token_3cx, dn, id);
    res.status(200).send('Request hangup successfully');
  } catch (error) {
    console.error('Error in POST /hangup:', error.message);
    return res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
