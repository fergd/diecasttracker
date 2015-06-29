if (Meteor.isClient) {
	// console.log('Greetings, user.');

	Template.carDisplay.helpers({
		'model' : function(){
			return CarList.find()
		},
		'year' : function(){
			return CarList.find()
		},
		'toynum' : function(){
			return CarList.find()
		},
		'series' : function(){
			return CarList.find()
		},
		'fav' : function(){
			return CarList.find()
		}
	});
}

if (Meteor.isServer) {
	Meteor.startup(function () {
		// console.log('Greetings, CLU.');
	});
}
 
CarList = new Mongo.Collection('cars');


// CarList.insert({
//   ToyNum: "BFF99",
//   FileName: "DSC01089.JPG",
//   ModelName: "Aston Martin 1963 DB5",
//   Series: "HW Workshop 2014 - HW All Stars",
//   Color: "Silver",
//   Year: "2014",
//   Favourite: true,
// });