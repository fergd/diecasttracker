Router.route('/car/:_id', {
	name: 'singleCarPage',
	template: 'carPage',
	data: function() {
		var currentCar = this.params._id;
		return CarList.findOne({_id: currentCar});
	}
	// ,
	// onAfterAction: function () {
	// 	$('[data-toy-data]').each(function() {
	// 		if ( '' === $.trim( $(this).text() ) ) {
	// 	  		$(this).closest('li').remove();
	// 		} 
	// 	});


	// }

//		$('[data-toy-data]:empty').each(function() {
// 			console.log('before remove');
// 			$(this).closest('.toy-info').remove();
// 			console.log('after remove');
// 		});

});

Template.carPage.rendered = function () {
	$('[data-toy-data]').each(function() {
		if ( '' === $.trim( $(this).text() ) ) {
	  		$(this).closest('li').remove();
		} 
	});
};