if (Meteor.isClient) {
	Meteor.subscribe("allCars");
	Accounts.ui.config({
  		passwordSignupFields: "USERNAME_ONLY"
	});
}

if (Meteor.isServer) {
	Meteor.startup(function () {
		
	});
}