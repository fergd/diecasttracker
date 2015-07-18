Template.carCount.helpers({
	'count' : function(){
		var currentUserId = Meteor.userId();
		return CarList.find({createdBy: currentUserId}).count()
	}	
});