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
    console.error('Error in GET /auto-dial:', error.message);
    return res.status(error.status).send(`Error in GET /auto-dial: ${error.message}`);
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
    console.error('Error in GET /project:', error.message);
    return res.status(error.status).send(`Error in GET /project: ${error.message}`);
  }
});

// 取得 outbound 外撥的人員資料
router.get('/outbound', async function(req, res, next) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    console.log(queryString)
    const outboundResult = await axiosBonsaleInstance.get(`${host}/outbound?${queryString}`);
    const outboundProject = outboundResult.data;
    return res.status(200).send(outboundProject);
  } catch (error) {
    console.error('Error in GET /outbound:', error.message);
    return res.status(error.status).send(`Error in GET /outbound: ${error.message}`);
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
    return res.status(error.status).send(`Error in PUT /project/:projectId/customer/:customerId/callStatus: ${error.message}`);
  }
});

// Bonsale 回寫 dialUpdate
router.put('/project/:projectId/customer/:customerId/dialUpdate', async function(req, res, next) {
  const { projectId, customerId } = req.params; // 從路徑參數中取得 projectId 和 customerId
  console.log('projectId:', projectId);
  console.log('customerId:', customerId);

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.put(
      `${host}/project/${projectId}/customer/${customerId}/dialUpdate`
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in PUT /project/:projectId/customer/:customerId/dialUpdate:', error.message);
    return res.status(error.status).send(`Error in PUT /outbound: ${error.message}`);
  }
});

// Bonsale 取得 訪談紀錄 /project/customer/visit
router.get('/project/customer/visit', async function(req, res, next) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    console.log(queryString)
    const response = await axiosBonsaleInstance.get(
      `${host}/project/customer/visit?${queryString}`,
    )

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in GET /project/customer/visit:', error.message);
    return res.status(error.status).send(`Error in GET /project/customer/visit: ${error.message}`);
  }
});

// Bonsale 回寫 訪談紀錄 /project/customer/visit
router.post('/project/customer/visit', async function(req, res, next) {
  const {projectId, customerId, visitType, visitedUsername, visitedAt, description, visitedResult, task } = req.body;

  if (!projectId || !customerId || !visitType || !visitedUsername || !visitedAt || !description || !visitedResult) {
    return res.status(400).send('Missing required fields');
  };

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.post(
      `${host}/project/customer/visit`,
      { projectId, customerId, visitType, visitedUsername, visitedAt, description, visitedResult, task }
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in POST /project/customer/visit:', error.message);
    return res.status(error.status).send(`Error in POST /project/customer/visit: ${error.message}`);
  }
});

module.exports = router;
