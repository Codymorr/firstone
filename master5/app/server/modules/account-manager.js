
const crypto 		= require('crypto');
const moment 		= require('moment');
const MongoClient 	= require('mongodb').MongoClient;

var db, accounts, recorder, balance, processed, orders;
MongoClient.connect(process.env.DB_URL, { useNewUrlParser: true }, function(e, client) {
	if (e){
		console.log(e);
	}	else{
		db = client.db(process.env.DB_NAME);
		accounts = db.collection('accounts');
		balance = db.collection('balance');
		recorder = db.collection('recorder');
		processed = db.collection('processed');
		orders = db.collection('orders');
	// index fields 'user' & 'email' for faster new account validation //
		accounts.createIndex({user: 1, email: 1});
		console.log('mongo :: connected to database :: "'+process.env.DB_NAME+'"');
	}
});

const guid = function(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});}

/*
	login validation methods
*/

exports.autoLogin = function(user, pass, callback)
{
	accounts.findOne({user:user}, function(e, o) {
		if (o){
			o.pass == pass ? callback(o) : callback(null);
		}	else{
			callback(null);
		}
	});
}

exports.manualLogin = function(user, pass, callback)
{
	accounts.findOne({user:user}, function(e, o) {
		if (o == null){
			callback('user-not-found');
		}	else{
			validatePassword(pass, o.pass, function(err, res) {
				if (res){
					callback(null, o);
				}	else{
					callback('invalid-password');
				}
			});
		}
	});
}

exports.generateLoginKey = function(user, ipAddress, callback)
{
	let cookie = guid();
	accounts.findOneAndUpdate({user:user}, {$set:{
		ip : ipAddress,
		cookie : cookie
	}}, {returnOriginal : false}, function(e, o){ 
		callback(cookie);
	});
}

exports.validateLoginKey = function(cookie, ipAddress, callback)
{
// ensure the cookie maps to the user's last recorded ip address //
	accounts.findOne({cookie:cookie, ip:ipAddress}, callback);
}

exports.generatePasswordKey = function(email, ipAddress, callback)
{
	let passKey = guid();
	accounts.findOneAndUpdate({email:email}, {$set:{
		ip : ipAddress,
		passKey : passKey
	}, $unset:{cookie:''}}, {returnOriginal : false}, function(e, o){
		if (o.value != null){
			callback(null, o.value);
		}	else{
			callback(e || 'account not found');
		}
	});
}

exports.validatePasswordKey = function(passKey, ipAddress, callback)
{
// ensure the passKey maps to the user's last recorded ip address //
	accounts.findOne({passKey:passKey, ip:ipAddress}, callback);
}

/*
	record insertion, update & deletion methods
*/

exports.addNewAccount = function (newData, callback)
{
	accounts.findOne({user:newData.user}, function(e, o) {
		if (o){
			callback('username-taken');
		}	else if (o){
            callback('number-taken');
		} else{
			accounts.findOne({email:newData.email}, function(e, o) {
				if (o){
					callback('email-taken');
				}	else{
					saltAndHash(newData.pass, function(hash){
						newData.pass = hash;
					// append date stamp when record was created //
						newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
						accounts.insertOne(newData, function(err,res) {
							if (err) throw err;
							// add balance to new user
							balance.insertOne({userId: newData._id, balance: parseInt(500)}, callback)
						});
					});
				}
			});
		}
	});
}

exports.updateAccount = function(newData, callback)
{
	let findOneAndUpdate = function(data){
		var o = {
			name : data.name,
			email : data.email,
			number : data.number,
			country : data.country
		}
		if (data.pass) o.pass = data.pass;
		accounts.findOneAndUpdate({_id:getObjectId(data.id)}, {$set:o}, {returnOriginal : false}, callback);
	}
	if (newData.pass == ''){
		findOneAndUpdate(newData);
	}	else { 
		saltAndHash(newData.pass, function(hash){
			newData.pass = hash;
			findOneAndUpdate(newData);
		});
	}
}

exports.updatePassword = function(passKey, newPass, callback)
{
	saltAndHash(newPass, function(hash){
		newPass = hash;
		accounts.findOneAndUpdate({passKey:passKey}, {$set:{pass:newPass}, $unset:{passKey:''}}, {returnOriginal : false}, callback);
	});
}

/*
	account lookup methods
*/

exports.getAllRecords = function(callback)
{
	accounts.find().toArray(
		function(e, res) {
		if (e) callback(e)
		else callback(null, res)
	});
}

exports.deleteAccount = function(id, callback)
{
	accounts.deleteOne({_id: getObjectId(id)}, callback);
}

exports.deleteAllAccounts = function(callback)
{
	accounts.deleteMany({}, callback);
}

exports.myBlance = function(id, callback) 
{
	balance.findOne({userId: getObjectId(`${id}`)}, function(err, res) {
		if (err) throw err;
		let balance = res.balance
		callback(null, balance)
	})
}
exports.sendPoints = async function(from, to, amt, callback )
{
	if ( from.email == to) {
		return callback('to-self')
	}
	let user = await balance.findOne({userId: getObjectId(from._id)})
	if(user.balance < amt) {
	   return callback('not-points')
	}
	let sendTo = await accounts.findOne({email: to});
	if(!sendTo) {
		return callback('not-found')
	}

	await balance.findOneAndUpdate({userId: getObjectId(sendTo._id)}, {$inc:{balance: parseInt(amt) }},async function(err, res) {
		if (err) 
		{
			return callback(err)
		}
		else {
			await balance.findOneAndUpdate({userId: getObjectId(from._id)}, {$inc:{balance: -parseInt(amt) }}, {returnOriginal: false}, function(err, res) {
				if (err) 
				{
					return callback(err)
				}
				recorder.insertOne({from: user.userId, to: sendTo._id, amount: parseInt(amt), date:new Date(Date.now())})
				callback(null, res.value.balance)
			})
		}
	})
}


exports.myTransactions = async function(user, callback) {
	var result = await recorder.aggregate([
        {$match : { 
			$or: [
				{from : getObjectId(user._id)},
				{to : getObjectId(user._id)}
			]
		 }},
		{ $lookup: {from: "accounts",localField: "to", foreignField: "_id",as: "sendTo"}},
		{ $lookup: { from: "accounts",localField: "from", foreignField: "_id", as: "gotFrom"}},
		{ $project: { _id: 1 , amount: 1, date: 1, 'sendTo.name': 1, 'sendTo.number': 1,'sendTo._id': 1, 'gotFrom.name': 1, 'gotFrom.number': 1,'gotFrom._id': 1  }},
		{ $sort: { date: -1 } },
   ]).toArray()

   callback(null, result)
}

/*
	private encryption & validation methods
*/

var generateSalt = function()
{
	var set = '0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ';
	var salt = '';
	for (var i = 0; i < 10; i++) {
		var p = Math.floor(Math.random() * set.length);
		salt += set[p];
	}
	return salt;
}

var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

var saltAndHash = function(pass, callback)
{
	var salt = generateSalt();
	callback(salt + md5(pass + salt));
}

var validatePassword = function(plainPass, hashedPass, callback)
{
	var salt = hashedPass.substr(0, 10);
	var validHash = salt + md5(plainPass + salt);
	callback(null, hashedPass === validHash);
}

var getObjectId = function(id)
{
	return new require('mongodb').ObjectID(id);
}

var listIndexes = function()
{
	accounts.indexes(null, function(e, indexes){
		for (var i = 0; i < indexes.length; i++) console.log('index:', i, indexes[i]);
	});
}

/*   ******** process the output *********
     1. Find a user which has the same last 9 digits as the one in the json data
     2. Give that user the amount in the json data to the found user
     3. Give the proceesed json array processed: true; method and then store that data to MongoDB collection
*/
exports.findUser = function(newData, e, callback) {

    text = newData.text;
    var reso = text.split('#').join("");
    var textArray = reso.split('[EXTRACT]');

    // get the date and save it as an id for the array
    var date = new Date();
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var allDate = year + month + day + hour + min + sec;

    // Extract the useful data using RegExp	
    var regularExpression = /Tix:\s+([0-9]+).+Waxaad\s+([0-9]+).+[^\(]+\(([0-9]+)\)\s+Tar:\s+([0-9\/\s:]+)/i;
    var output = [];
	
    var item;
    // save the extracted data 
    for (var i = 1; i < textArray.length; i++) {
        item = textArray[i].match(regularExpression);
        output.push({
            id: item[1].trim(),
            amount: item[2].trim(),
            number: item[3].trim(),
            time: item[4].trim()
        });
    }

    // save all the data to database as  processed data
    var stringIt = JSON.stringify(allDate);
    var allIn = 'var ' + allDate + '=' + JSON.stringify(output);
	console.log(allIn);
	processed.insertMany(output, function(err, res) {
    if (err) throw err;
    console.log("1 document inserted");
    });
	
    
	// ----------------- the problem starts from here ------------------------------------
	//****************************************************************************************
	//****************************************************************************************
	//****************************************************************************************
	
	var getLength = output.length;
    for (var i = 0; i < output.length; i++) {
        let numbers = output[i].number;
        let amount1 = output[i].amount;
		
		/*
		for(var h = 0; h< output.length; h++){
		db.collection('accounts').find({}).toArray(
		if()
		}
		*/
		var query = { number: numbers };
        db.collection("accounts").find(query).toArray(function(err, result, from, to) {
        if (err) throw err;
        for (j= 0; j< result.length; j++) {
			let id = result[j]._id;
			//get the number of that id
			let hisNumber = result[j].number;
			//get the array with the same number in output array
			const targetIndex = output.findIndex(item => item.number === hisNumber);
			//get the amount of target index
			let getAmount = output[targetIndex].amount;
			
            balance.findOneAndUpdate({
                userId: getObjectId(id)
            }, {
                $inc: {
                    balance: parseInt(getAmount)
                }
            }, async function(err, res) {
                if (err) {
                    return callback(err)
                } else {
                    callback(null, res.value.balance)
                }
            });
			
			// store the transaction history of "taano" user to recorder collection
            var taano = {
                name: 'Taano'
            };
            var result1 = [];
            db.collection("accounts").find(taano).toArray(function(err, result1) {
                if (err) throw err;
                id2 = result1[0]._id;
                console.log(id2)

                recorder.insertOne({
                    from: id2,
                    to: id,
                    amount: parseInt(getAmount),
                    date: new Date(Date.now())
                })
            });
		 };
			
			
		 
        });
		 
	};
	
	}

/* create an api

* Give access to ip address
  1. Get the merchant email and Ip address to give access to the api
  
* Recieve the following data from website (get request)
  1. Billing Info
  2. User Email
  3. Receiver Email "in the background"
  4. Order ID
  5. Store that in the merchant accounts database
  
* Process the recieved data
  1. Make the user login or signup
  2. If he doesn't have any balance tell him to fill his balance
  3. Give the user a default amount and email
  3. After the user pays the amount give the merchant server a authorization boolen or code (post request)
  
*/


/*exports.giveAccessToApi = function(e, data){
	var newApi = data.info;
	db.collection('access').insertOne(newApi);
}*/
exports.extractDataForApi = function(newData, callback){
	// Render the revieved data to a billing page of taano
	// When the user accepts the order send him to the login page
	// sotre the billing data in database
	// Paste the email , amount and billing info by default to the taano's send page
	//db.collection('billingInfo').insertOne(newData);
	//console.log(newData);
	orders.insertOne(newData);
}
// Authenticate Order
exports.authenticateOrder = function(cookie1, cookie2, callback){
	var query = {recieverEmail: cookie1}
	orders.find(query).toArray(function(err, result){
		if(err) throw err;
		for (k = 1; k < result.length; k++){
			amtxxxx = result[k].amount;
			emailxxxx = result[k].recieverEmail;
		}
		 if(cookie1 == emailxxxx && cookie2 == amtxxxx){
			 console.log('success');
			 //callback('success');
		 }else{
			 console.log('failure');
			 //callback('failure')
		 }
		
	});
}
/*exports.SendToken = function(){
	// if user sends the money create a token or a boolen that tells the customer sever that the order is done
}*/