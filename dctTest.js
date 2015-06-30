CarList = new Mongo.Collection('cars');

if (Meteor.isClient) {
	// console.log('Greetings, user.');

	Template.carDisplay.helpers({
		'toynum' : function(){
			return CarList.find()
		},
		'model' : function(){
			return CarList.find()
		},
		'series' : function(){
			return CarList.find()
		},
		'color' : function(){
			return CarList.find()
		},
		'year' : function(){
			return CarList.find()
		},
		'seriesNum' : function(){
			return CarList.find()
		},
		'collector' : function(){
			return CarList.find()
		},		
		'fav' : function(){
			return CarList.find()
		},
		'notes' : function(){
			return CarList.find()
		}
	});

	Template.carCount.helpers({
		'count' : function(){
			return CarList.find().count()
		}	
	});

	Template.carDisplay.events({
		'click .remove': function(){
			var carID = this._id;
			Session.set('selectedCar', carID);
			console.log(carID);

			if (confirm('Do you really want to delete this car?')) {
				var selectedCar = Session.get('selectedCar');
				CarList.remove(selectedCar);
				console.log('User deleted ' + selectedCar);
			} else {
				console.log('User did cancelled removal of ' + carID);
			}
		}
	});

	Template.addCarForm.events({
		'submit form' : function(event,template){
			event.preventDefault();

			var toyNumVar = event.target.ToyNum.value;
			var modelNameVar = event.target.ModelName.value;
			var seriesVar = event.target.Series.value;
			var colorVar = event.target.Color.value;
			var yearVar = event.target.Year.value;
			var seriesNumVar = event.target.SeriesNum.value;
			var collectorNumVar = event.target.CollectorNum.value;
			var favouriteVar = event.target.Favourite.value;
			var notesVar = event.target.Notes.value;

			CarList.insert({
				ToyNum: toyNumVar,
				ModelName: modelNameVar,
				Series: seriesVar,
				Color: colorVar,
				Year: yearVar,
				SeriesNum: seriesNumVar,
				CollectorNum: collectorNumVar,
				Favourite: favouriteVar,
				Notes: notesVar
			});
			template.find("form").reset();
			console.log('form reset');
		}
	});
}

if (Meteor.isServer) {
	Meteor.startup(function () {
		// console.log('Greetings, CLU.');
	});
}