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
	$('[data-toy-data]:empty').each(function() {
		$(this).closest('.toy-info').remove();
	});
};