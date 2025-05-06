const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

const host = process.env.BONSALE_HOST;
const xApiKey = X_API_KEY=process.env.BONSALE_X_API_KEY;
const xApiSecret = X_API_KEY=process.env.BONSALE_X_API_SECRET;

const axiosBonsaleInstance = axios.create({
  baseURL: host,
  headers: {
    'X-API-KEY': xApiKey,
    'X-API-SECRET': xApiSecret,
  },
});

// 取得 Bonsale 外撥專案
router.get('/auto-dial', async function(req, res, next) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    const autoDialData = await axiosBonsaleInstance.get(`${host}/project/auto-dial?${queryString}`);
    const autoDialProject = autoDialData.data;
    return res.status(200).send(autoDialProject);
  } catch (error) {
    console.error('Error in POST /hangup:', error.message);
    return res.status(500).send('Internal Server Error');
  }
});

// 取得 Bonsale 專案資料
router.get('/project', async function(req, res, next) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    console.log(queryString)
    const autoDialData = await axiosBonsaleInstance.get(`${host}/project/customer?${queryString}`);
    const autoDialProject = autoDialData.data;
    return res.status(200).send(autoDialProject);
  } catch (error) {
    console.error('Error in POST /hangup:', error.message);
    return res.status(500).send('Internal Server Error');
  }
});

// Bonsale 回寫 callStatus
router.put('/project/:projectId/customer/:customerId/callStatus', async function(req, res, next) {
  const { projectId, customerId } = req.params; // 從路徑參數中取得 projectId 和 customerId
  const { callStatus } = req.body; // 從請求主體中取得 callStatus
  console.log('callStatus:', callStatus);
  console.log('projectId:', projectId);
  console.log('customerId:', customerId);

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.put(
      `${host}/project/${projectId}/customer/${customerId}/callStatus`,
      { callStatus } // 傳遞 callStatus 作為請求主體
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in PUT /project/:projectId/customer/:customerId/callStatus:', error.message);

    // 如果 Bonsale API 回傳錯誤，回傳錯誤訊息
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }

    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

module.exports = router;
