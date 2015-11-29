Router.route('/car/:_id', {
    name: 'singleCarPage',
    template: 'carPage',
    data: function() {
        var currentCar = this.params._id;
	    return CarList.findOne({_id: currentCar});
    }
});
Template.carPage.rendered = function () {
	//Seek out any empty data info and remove the parent list item
	console.log('before empty func');
	$('[data-toy-data]:empty').each(function() {
		console.log('before remove');
		$(this).closest('.toy-info').remove();
		console.log('after remove');
	});
	console.log('after func');
};