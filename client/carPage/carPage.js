Router.route('/car/:_id', {
	name: 'singleCarPage',
	template: 'carPage',
	data: function() {
		var currentCar = this.params._id;
		return CarList.findOne({_id: currentCar});
	}
});

Template.carPage.rendered = function () {
	$('[data-toy-data]').each(function() {
		if ( '' === $.trim( $(this).text() ) ) {
	  		$(this).closest('li').remove();
		} 
	});
};