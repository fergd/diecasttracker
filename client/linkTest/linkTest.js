Template.linkTest.helpers({
  	'linkTest': function () {
		var currentUserId = Meteor.userId();	
		return CarList.find({createdBy: currentUserId}, {sort: {createdAt: -1}});
	}
});