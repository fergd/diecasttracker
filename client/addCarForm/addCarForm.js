CarList = new Mongo.Collection('cars');

Template.addCarForm.events({
	'submit form' : function(event,template){
		event.preventDefault();

		var toyNumVar = event.target.dc_toy_num.value;
		var modelNameVar = event.target.dc_model_name.value;
		var seriesVar = event.target.dc_series.value;
		var colorVar = event.target.dc_color.value;
		var yearVar = event.target.dc_year.value;
		var seriesNumVar = event.target.dc_series_num.value;
		var collectorNumVar = event.target.dc_collector_num.value;
		var favouriteVar = event.target.dc_favourite.value;
		var notesVar = event.target.dc_notes.value;
		var imgUrlVar = event.target.dc_img_url.value;

		CarList.insert({
			dc_toy_num: toyNumVar,
			dc_model_name: modelNameVar,
			dc_series: seriesVar,
			dc_color: colorVar,
			dc_year: yearVar,
			dc_series_num: seriesNumVar,
			dc_collector_num: collectorNumVar,
			dc_favourite: favouriteVar,
			dc_notes: notesVar,
			dc_img_url: imgUrlVar
		}
		// ,
		// function( error, result) { 
		// 	    if ( error ) console.log ( error ); //info about what went wrong
		// 	    if ( result ) console.log ( result ); //the _id of new object if successful
		// 	  }
		);

		

		//when data is submetted, recet the inputs
		template.find("form").reset();
		console.log('form reset');

	}

});
