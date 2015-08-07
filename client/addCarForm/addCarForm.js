CarList = new Mongo.Collection('cars');
Template.addCarForm.events({
	'submit form' : function(event,template){
		event.preventDefault();
		var currentUserId = Meteor.userId();		
		var toyNumVar = event.target.dc_toy_num.value;
		var modelNameVar = event.target.dc_model_name.value;
		var seriesVar = event.target.dc_series.value;
		var colorVar = event.target.dc_color.value;
		var yearVar = event.target.dc_year.value;
		var seriesNumVar = event.target.dc_series_num.value;
		var collectorNumVar = event.target.dc_collector_num.value;
		var favouriteVar = event.target.dc_favourite.value;
		var binVar = event.target.dc_bin_num.value;
		
		CarList.insert({
			dc_toy_num: toyNumVar,
			dc_model_name: modelNameVar,
			dc_series: seriesVar,
			dc_color: colorVar,
			dc_year: yearVar,
			dc_series_num: seriesNumVar,
			dc_collector_num: collectorNumVar,
			dc_bin_num: binVar,
			createdBy: currentUserId,
			createdAt: new Date()     
		});
		template.find("form").reset();
	}
});