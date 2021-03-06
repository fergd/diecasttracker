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
// Only publish tasks that are public or belong to the current user
Meteor.publish("allCars", function () {
	return CarList.find({
      $or: [
        { private: {$ne: true} },
        { owner: this.userId }
      ]
    });
});
