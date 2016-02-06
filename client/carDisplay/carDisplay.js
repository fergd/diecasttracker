Template.carDisplay.helpers({
  	'model': function () {
		var currentUserId = Meteor.userId();	
		return CarList.find({createdBy: currentUserId}, {sort: {createdAt: -1}});
	}
});
Template.carDisplay.events({
	'click .cell-toggle-checked': function(){
		CarList.update(this._id, {$set: {checked: !this.checked}});
	},
	'click .remove': function(){	
		var carID = this._id;
		var currentUserId = Meteor.userId();	
		Session.set('selectedCar', carID);

		if (confirm('Do you really want to delete this car?')) {
			var selectedCar = Session.get('selectedCar');
			CarList.remove(selectedCar);
			console.log(currentUserId + ' removed ' + carID);
		} else {
			console.log(currentUserId + ' cancelled removal of ' + carID);
		}
	}
});
Template.carDisplay.onRendered(function(){
	$(function(){
	  $("#car-list-table").tablesorter();
	});
});
