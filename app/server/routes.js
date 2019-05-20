
var CT = require('./modules/country-list');
var AM = require('./modules/account-manager');
var EM = require('./modules/email-dispatcher');

module.exports = function(app) {

	// send points to users
	app.get('/getPoints', function(req, res) {
			res.render('sender');
	});
	
		app.post('/getIt', function(req, res) {
			AM.findUser({text : req.body['data']});
			res.redirect('/getPoints');
   });
    
    app.get('/getTrans', function(req, res) {
		    //AM.extractDataForApi( function(myOrder){
			res.render('getTrans');
		//})
	});
	/*
	app.get('/getApi', function(req, res) {
			res.render('getApi');
	});
	
    app.post('/getNewApi', function(req, res) {
			AM.giveAccessToApi({
				api : req.body['newApi'],
				email : req.body['newApiEmail']
				});
			res.redirect('/getApi');
   });
   */
   

   	app.post('/getTransData', function(req, res, next) {
			/*AM.extractDataForApi({
				email : req.body['revieverEmail'],
				senderEmail : req.body['senderEmail'],
				orderId : req.body['orderId'],
				amount : req.body['amount'],
				ShippingInfo : req.body['shippingInfo']
				});*/
				
			AM.extractDataForApi({
				   recieverEmail : req.body['recieverEmail'],
				   senderEmail : req.body['senderEmail'],
				   orderId : req.body['orderId'],
				   amount : req.body['amount'],
				   shippingInfo : req.body['shippingInfo']
	        });
				  
			   // Store data in cookie for later comparison
                res.cookie('orderInfo', req.body['recieverEmail']);
				res.cookie('orderInfo1', req.body['amount']);
                 console.log('cookie created successfully');
				 //console.log(orderInfo);
				 
				 
				 
			    res.render('getTrans', { 
			        title : 'Your Orders', 
					recieverEmail : req.body['recieverEmail'],
					senderEmail : req.body['senderEmail'],
				    orderId : req.body['orderId'],
				    amount : req.body['amount'],
				    shippingInfo : req.body['shippingInfo']
					});
				
				
                 res.end();
			   
			   
		
		});
/*
	login & logout
*/

	app.get('/', function(req, res){
	// check if the user has an auto login key saved in a cookie //
		if (req.cookies.login == undefined){
			res.render('login', { title: 'Hello - Please Login To Your Account' });
		}	else{
	// attempt automatic login //
			AM.validateLoginKey(req.cookies.login, req.ip, function(e, o){
				if (o){
					AM.autoLogin(o.user, o.pass, function(o){
						req.session.user = o;
						res.redirect('/home');
					});
				}	else{
					res.render('login', { title: 'Hello - Please Login To Your Account' });
				}
			});
		}
	});
	
	app.post('/', function(req, res){
		AM.manualLogin(req.body['user'], req.body['pass'], function(e, o){
			if (!o){
				res.status(400).send(e);
			}	else{
				req.session.user = o;
				if (req.body['remember-me'] == 'false'){
					res.status(200).send(o);
				}	else{
					AM.generateLoginKey(o.user, req.ip, function(key){
						res.cookie('login', key, { maxAge: 900000 });
						res.status(200).send(o);
					});
				}
			}
		});
	});

	app.post('/logout', function(req, res){
		res.clearCookie('login');
		req.session.destroy(function(e){ res.status(200).send('ok'); });
	})
	
/*
	control panel
*/
	
	app.get('/home', async function(req, res) {
		if (req.session.user == null){
			res.redirect('/');
		}	
		else{
			await AM.myBlance(req.session.user._id, (e, o) => {
				if(e)throw e;
				balnce = o
			})
			await AM.myTransactions(req.session.user, (e, o) => {
				transactions = o
			})
			var reciever = req.cookies.orderInfo;
			var recieverAmount = req.cookies.orderInfo1;
			res.render('home', {
				title : 'Control Panel',
				countries : CT,
				recieverEmail : reciever,
				amount : recieverAmount,
				udata : req.session.user,
				balnce,
				transactions 
			});
		}
	});
	
	app.post('/home', function(req, res){
		if (req.session.user == null){
			res.redirect('/');
		}	else{
			AM.updateAccount({
				id		: req.session.user._id,
				name	: req.body['name'],
				email	: req.body['email'],
			    number	: req.body['number'],
				pass	: req.body['pass'],
				country	: req.body['country']
			}, function(e, o){
				if (e){
					res.status(400).send('error-updating-account');
				}	else{
					req.session.user = o.value;
					res.status(200).send('ok');
				}
			});
		}
	});

/*
	new accounts
*/

	app.get('/signup', function(req, res) {
		res.render('signup', {  title: 'Signup', countries : CT });
	});
	
	app.post('/signup', function(req, res){
		AM.addNewAccount({
			name 	: req.body['name'],
			email 	: req.body['email'],
			number	: req.body['number'],
			user 	: req.body['user'],
			pass	: req.body['pass'],
			country : req.body['country']
		}, function(e){
			if (e){
				res.status(400).send(e);
			}	else{
				res.status(200).send('ok');
			}
		});
	});

/*
	password reset
*/

	app.post('/lost-password', function(req, res){
		let email = req.body['email'];
		AM.generatePasswordKey(email, req.ip, function(e, account){
			if (e){
				res.status(400).send(e);
			}	else{
				EM.dispatchResetPasswordLink(account, function(e, m){
			// TODO this callback takes a moment to return, add a loader to give user feedback //
					if (!e){
						res.status(200).send('ok');
					}	else{
						for (k in e) console.log('ERROR : ', k, e[k]);
						res.status(400).send('unable to dispatch password reset');
					}
				});
			}
		});
	});

	app.get('/reset-password', function(req, res) {
		AM.validatePasswordKey(req.query['key'], req.ip, function(e, o){
			if (e || o == null){
				res.redirect('/');
			} else{
				req.session.passKey = req.query['key'];
				res.render('reset', { title : 'Reset Password' });
			}
		})
	});
	
	app.post('/reset-password', function(req, res) {
		let newPass = req.body['pass'];
		let passKey = req.session.passKey;
	// destory the session immediately after retrieving the stored passkey //
		req.session.destroy();
		AM.updatePassword(passKey, newPass, function(e, o){
			if (o){
				res.status(200).send('ok');
			}	else{
				res.status(400).send('unable to update password');
			}
		})
	});
	
/*
	view, delete & reset accounts
*/
	
	app.get('/print', function(req, res) {
		AM.getAllRecords( function(e, accounts){
			res.render('print', { title : 'Account List', accts : accounts });
		})
	});
	
	app.post('/delete', function(req, res){
		AM.deleteAccount(req.session.user._id, function(e, obj){
			if (!e){
				res.clearCookie('login');
				req.session.destroy(function(e){ res.status(200).send('ok'); });
			}	else{
				res.status(400).send('record not found');
			}
		});
	});
	
	app.get('/reset', function(req, res) {
		AM.deleteAllAccounts(function(){
			res.redirect('/print');
		});
	});

// handle send points
	app.post('/send', function(req, res) {
		//var cookie1 = req.cookies('orderInfo');
		//var cookie2 = req.cookies('orderInfo1');
		AM.authenticateOrder(req.body.email, req.body.amount);
		res.clearCookie('orderInfo1');
		res.clearCookie('orderInfo');
		AM.sendPoints(req.session.user, req.body.email, req.body.amount, function(e, o) {
			if (e)
			{
				res.status(403).send(e)
			}
			else {
				res.status(200).send(o.toString())
			}
		});
		
	})
// route for quick testing
	// app.get('/transactions', function(req, res) {
	// 	AM.myTransactions(req.session.user, function(e, results) {
	// 		if(e) return res.status(404)
	// 		return res.status(200).send(results)
	// 	})
	// })
	app.get('*', function(req, res) { res.render('404', { title: 'Page Not Found'}); });
	
	


};
