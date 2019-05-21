
/**
	* Node.js Login Boilerplate
	* More Info : https://github.com/braitsch/node-login
	* Copyright (c) 2013-2018 Stephen Braitsch
**/

var http = require('http');
var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var MongoStore = require('connect-mongo')(session);

var app = express();

app.locals.pretty = true;
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/app/server/views');
app.set('view engine', 'pug');
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(require('stylus').middleware({ src: __dirname + '/app/public' }));
app.use(express.static(__dirname + '/app/public'));

// build mongo database connection url //

process.env.DB_HOST = process.env.DB_HOST || 'mongo';
process.env.DB_USER = process.env.DB_USER || 'mongo';
process.env.DB_PORT = process.env.DB_PORT || 'ds259586.mlab.com:59586';
process.env.DB_NAME = process.env.DB_NAME || 'heroku_t8xqw6t1';
process.env.DB_PASS = process.env.DB_PASS || '4M3Gr_FGyfjks!v'

if (app.get('env') != 'live'){
	process.env.DB_URL = 'mongodb://'+process.env.DB_HOST+':'+process.env.DB_PORT;
}	else {
// prepend url with authentication credentials // 
	process.env.DB_URL = 'mongodb://'+process.env.DB_USER+':'+process.env.DB_PASS+'@'+process.env.DB_HOST+':'+process.env.DB_PORT;
}

app.use(session({
	secret: 'faeb4453e5d14fe6f6d04637f78077c76c73d1b4',
	proxy: true,
	resave: true,
	saveUninitialized: true,
	store: new MongoStore({ url: process.env.DB_URL })
	})
);

// ------------------------------this the code i want you to fix-----------------------------

/*
//recieve from client 
var reciver = $('#inputx').value;
var amount = $('#inputy').value;
var sender = this.user();
var user = this.user();

$("#submit").click(function(){

		db.recived({reciever.balance + amount});
		db.sent({sender.balance - amount});

         var db.reciever.collection({

             recorder.insertMany({"you recived" + date + "from" + sender + "your balance is" + balance})

        });

        var db.sender.collection({

             recorder.insertMany({"you recived" + date + "from" + reciever + "your balance is" + balance})

         });

}
//fetch every time user logs in

server.post({

     // when the user logs in get the user email and then fetch his account's balance

    $('#divx').value = db.user.balance();

	//when the user logs in fetch his transaction recorder
	
	$('#divy').value = db.user.recorder();
});


//------------------ the end of the code i want you to fix -------------------

*/


require('./app/server/routes')(app);

http.createServer(app).listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));
});

