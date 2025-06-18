const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');


const indexRouter = require('./routes/index');
const callControlRouter = require('./routes/callControl');
const xApiRouter = require('./routes/xApi');
const { router: bonsaleRouter} = require('./routes/bonsale');
const { router: outboundCampaigmRouter} = require('./routes/outboundCampaigm');
const { router: projectOutboundRouter } = require('./routes/projectOutbound');
const { router: bonsaleMemberMackCallRouter } = require('./routes/bonsaleMemberMackCall');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 啟用 CORS
app.use(cors()); // 預設允許所有來源
// 如果需要更精細的控制，可以傳入配置，例如：
// app.use(cors({ origin: 'http://example.com', methods: ['GET', 'POST'] }));

app.use('/', indexRouter);
app.use('/api/bonsaleMemberMackCall', bonsaleMemberMackCallRouter); // 將 /api 路徑指向 indexRouter
app.use('/api/callControl', callControlRouter);
app.use('/api/bonsale', bonsaleRouter);
app.use('/api/xApi', xApiRouter);
app.use('/api/outboundCampaigm', outboundCampaigmRouter);
app.use('/api/projectOutbound', projectOutboundRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
