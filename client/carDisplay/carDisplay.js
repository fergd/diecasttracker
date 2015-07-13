Template.carDisplay.helpers({
	'model' : function(){
		return CarList.find()
	}
});

Template.carDisplay.events({
	'click .remove': function(){
		var currentUserId = Meteor.userId();		
		var carID = this._id;
		Session.set('selectedCar', carID);
		console.log(carID);

		if (confirm('Do you really want to delete this car?')) {
			var selectedCar = Session.get('selectedCar');
			CarList.remove(selectedCar);
			console.log(currentUserId + ' removed ' + carID);
		} else {
			console.log(currentUserId + ' cancelled removal of ' + carID);
		}
	}
});

Template.carDisplay.helpers({
  CarList: function () {
    // Show newest tasks first
    return CarList.find({}, {sort: {createdAt: -1}});
  }
});

Template.carDisplay.users = function () {
  return Meteor.users.find();
  console.log(users);
};