Template.browseCars.helpers({
  	'imgmodel': function () {
		var currentUserId = Meteor.userId();	
		return CarList.find({createdBy: currentUserId}, {sort: {createdAt: -1}});
	}
});

Template.browseCars.rendered = function () {
	$("img").unveil();
};

if (Meteor.isClient) {
    $(function() {
        $("img").unveil();
    });
}