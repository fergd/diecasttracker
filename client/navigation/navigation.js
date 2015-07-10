Meteor.startup(function(){
    $(document).ready(function() {
	    if(location.pathname != "/") {
	    $('nav a[href^="/' + location.pathname.split("/")[1] + '"]').parent().addClass('active');
	    } else $('nav a:eq(0)').addClass('active');
	});
});



