if (Meteor.isClient) {
	//Figuring out how to edit an existing document
	// Template.carDisplay.events({
	// 	'click .update': function(){
	// 		event.preventDefault();

	// 		var carToyNum = this.dc_toy_num;
	// 		Session.set('selectedCar', carToyNum);
	// 		console.log('update ' + carToyNum);
	// 	}
	// });
}

if (Meteor.isServer) {
	Meteor.startup(function () {
	});
}