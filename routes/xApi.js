const express = require('express');
const router = express.Router();
require('dotenv').config();

const {
  activeCalls,
} = require('../services/xApi.js');


// 3CX Xapi 取得當前活躍呼叫的列表
router.get('/activeCalls', async function(req, res, next) {
  const {token_3cx} = req.body;
  try {
    const result = await activeCalls(token_3cx);
    console.log('成功 獲取當前活躍呼叫的列表:', result);
    return res.status(200).send(result);
  } catch (error) {
    console.error('Error in POST /activeCalls:', error.message);
    return res.status(error.status).send(`Error in POST /activeCalls: ${error.message}`);
  }
});

module.exports = router;
