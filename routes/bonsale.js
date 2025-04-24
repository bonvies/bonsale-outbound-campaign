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

module.exports = router;
