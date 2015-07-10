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
	console.log('before location');
	$('body').css('display', 'none');
	
    if(location.pathname != "/") {
    $('nav a[href^="/' + location.pathname.split("/")[1] + '"]').parent().addClass('active');
    } else $('nav a:eq(0)').addClass('active');
    console.log('after location');
}

if (Meteor.isServer) {
	Meteor.startup(function () {
	});
}