CarList = new Mongo.Collection('cars');
//This is necessary for the search to find the db apparently, not sure what to do with the other call atm
CarList.initEasySearch(['dc_toy_num', 'dc_model_name', 'dc_img_url'], {
    'limit' : 20,
    'use' : 'mongo-db'
});

CarList.allow({
    'insert': function (userId) {
      return true; 
    },
    'update': function (userId) {
      return true; 
    },
    'remove': function (userId) {
    	return true; 
    }
 });

Meteor.publish("allCars", function () {
	return CarList.find();
});




// function adminUser(userId) {
//   var adminUser = Meteor.users.findOne({username:"admin"});
//   return (userId && adminUser && userId === adminUser._id);
// }
// Lugares.allow({
//   insert: function(userId, lugar){
//     return adminUser(userId);
//   },
//   update: function(userId, lugares, fields, modifier){
//     return adminUser(userId);
//   },
//   remove: function (userId, docs){
//     return adminUser(userId);
//   }
// });