/*
 * Script Name: Player Farms Finder
 * Version: v1.2.6
 * Last Updated: 2020-08-20
 * Author: RedAlert
 * Author URL: https://twscripts.ga/
 * Author Contact: RedAlert#9859 (Discord)
 * Approved: t13954516
 * Approved Date: 2020-05-18
 * Mod: JawJaw
 */

var scriptData = {
	name: 'Player Farms Finder',
	version: 'v1.2.6',
	author: 'RedAlert',
	authorUrl: 'https://twscripts.ga/',
	helpLink: 'https://forum.tribalwars.net/index.php?threads/player-farms-finder-script.285245/',
};

// Player Data
var playerId = game_data.player.id;
var playerName = game_data.player.name;

// User Input
if (typeof DEBUG !== 'boolean') DEBUG = false;

// Constants
var RADIUS = 20; // default radius
var VILLAGE_TIME = 'mapVillageTime'; // localStorage key name
var VILLAGES_LIST = 'mapVillagesList'; // localStorage key name
var TIME_INTERVAL = 60 * 60 * 1000; // fetch data every hour

// Globals
var villages = [];
var allBarbs = [];
var playerVillages = [];

// Translations
var translations = {
	en_DK: {
		'Player Farms Finder': 'Player Farms Finder',
		'Player:': 'Player:',
		'Player Villages:': 'Player Villages:',
		'Radius:': 'Radius:',
		'Barbs found:': 'Barbs found:',
		'Area:': 'Area:',
		'Coordinates:': 'Coordinates:',
		'Scout Script:': 'Scout Script:',
		'Error while fetching "village.txt"!': 'Error while fetching "village.txt"!',
		Help: 'Help',
	},
	en_US: {
		'Player Farms Finder': 'Player Farms Finder',
		'Player:': 'Player:',
		'Player Villages:': 'Player Villages:',
		'Radius:': 'Radius:',
		'Barbs found:': 'Barbs found:',
		'Area:': 'Area:',
		'Coordinates:': 'Coordinates:',
		'Scout Script:': 'Scout Script:',
		'Error while fetching "village.txt"!': 'Error while fetching "village.txt"!',
		Help: 'Help',
	},
	sk_SK: {
		'Player Farms Finder': 'Hľadač fariem hráča',
		'Player:': 'Hráč:',
		'Player Villages:': 'Dediny hráča:',
		'Radius:': 'Vzdialenosť:',
		'Barbs found:': 'Nájdené barbarky:',
		'Area:': 'Oblasť:',
		'Coordinates:': 'Súradnice:',
		'Scout Script:': 'Špehovací skript:',
		'Error while fetching "village.txt"!': 'Chyba pri načítaní "village.txt"!',
		Help: 'Pomoc',
	},
};

// Init Debug
initDebug();

// Init Translations Notice
initTranslationsNotice();

// Auto-update localStorage villages list
if (localStorage.getItem(VILLAGE_TIME) != null) {
	var mapVillageTime = parseInt(localStorage.getItem(VILLAGE_TIME));
	if (Date.parse(new Date()) >= mapVillageTime + TIME_INTERVAL) {
		// hour has passed, refetch village.txt
		fetchVillagesData();
	} else {
		// hour has not passed, work with village list from localStorage
		var data = localStorage.getItem(VILLAGES_LIST);
		villages = CSVToArray(data);
		playerFarmsFinder();
	}
} else {
	// Fetch village.txt
	fetchVillagesData();
}

// Fetch 'village.txt' file
function fetchVillagesData() {
	$.get('map/village.txt', function (data) {
		villages = CSVToArray(data);
		localStorage.setItem(VILLAGE_TIME, Date.parse(new Date()));
		localStorage.setItem(VILLAGES_LIST, data);
	})
		.done(function () {
			playerFarmsFinder();
		})
		.fail(function (error) {
			console.error(`${scriptInfo()} Error:`, error);
			UI.ErrorMessage(`${tt('Error while fetching "village.txt"!')}`, 4000);
		});
}

// Init: Player Farms Finder
function playerFarmsFinder() {
	// Populate Villages Arrays
	populateVillagesLists();

	// Show popup
	var [barbsCoordsList, areaCoords, barbsCount, playerVillagesCount] = doPlayerBarbsCalculations(RADIUS);

	var scoutBarbsScript = generateScoutScript(barbsCoordsList);

	var content = `
		<p class="ra-fs12">
			<strong>${tt('Player:')}</strong> 
			<a href="/game.php?screen=info_player&id=${playerId}" target="_blank" rel="noopener noreferrer">${playerName}</a><br>
			<strong>${tt('Player Villages:')}</strong> ${playerVillagesCount}
		</p>
		<p class="ra-fs12"><strong>${tt('Radius:')}</strong>
			<select id="radius_choser" onChange="updatePlayerBarbsList(this);">
				<option value="5">5</option>
				<option value="10">10</option>
				<option value="15">15</option>
				<option value="20" selected>20</option>
				<option value="25">25</option>
				<option value="30">30</option>
				<option value="35">35</option>
				<option value="40">40</option>
			</select>
		</p>
		<p class="ra-fs12">
			<strong>${tt('Barbs found:')}</strong>
			<span id="barbsCount">${barbsCount}</span><br>
			<strong>${tt('Area:')}</strong> <span id="areaCoords">${areaCoords}</span>
		</p>
		<div class="ra-mb15">
			<label class="ra-fw600" for="barbCoordsList">${tt('Coordinates:')}</label>
			<textarea id="barbCoordsList" class="ra-textarea" readonly>${barbsCoordsList}</textarea>
		</div>
		<div class="ra-mb15">
			<label class="ra-fw600" for="barbCoordsScript">${tt('Scout Script:')}</label>
			<textarea id="barbCoordsScript" class="ra-textarea" readonly>${scoutBarbsScript}</textarea>
		</div>
	`;

	var popupContent = preparePopupContent(content);
	Dialog.show('content', popupContent);
}

// Populate villages list
function populateVillagesLists() {
	villages.forEach((village) => {
		// filter out all barb villages
		if (village[4] == '0' && village[6] == '0') {
			allBarbs.push(village);
		}
		// filter out all the player's villages
		if (village[4] == playerId) {
			playerVillages.push(village);
		}
	});

	if (DEBUG) {
		console.debug(`${scriptInfo()} Barbarian Villages:`, allBarbs);
		console.debug(`${scriptInfo()} Own Villages:`, playerVillages);
	}
}

// Calculate Barbs for Player on Load Time
function doPlayerBarbsCalculations(radius) {
	// Filter barbarian villages by Player bounding coordinates
	const [minX, minY, maxX, maxY] = getPlayerBoundaryCoords(playerVillages, radius);
	let areaCoords = minX + '|' + minY + ' - ' + maxX + '|' + maxY;

	var barbsInsidePlayerRadius = calculateBarbsInsideRadius(minX, minY, maxX, maxY);

	var barbCoords = getBarbCoords(barbsInsidePlayerRadius);
	let barbsCount = barbCoords.length;
	let barbsCoordsList = barbCoords.join(' ');
	var playerVillagesCount = playerVillages.length;

	return [barbsCoordsList, areaCoords, barbsCount, playerVillagesCount];
}

// Calculate Barbs for Player onChange of select
function updatePlayerBarbsList(select) {
	var radius = parseInt(select.value);

	// Filter barbarian villages by Player bounding coordinates
	var [barbsCoordsList, areaCoords, barbsCount] = doPlayerBarbsCalculations(radius);

	var scoutBarbsScript = generateScoutScript(barbsCoordsList);

	$('#barbsCount').text(barbsCount);
	$('#areaCoords').text(areaCoords);
	$('#barbCoordsList').val(barbsCoordsList);
	$('#barbCoordsScript').val(scoutBarbsScript);
}

// Helper: Find list of barbs inside player radius
function calculateBarbsInsideRadius(minX, minY, maxX, maxY) {
	var barbsInsidePlayerRadius = [];

	allBarbs.forEach((barb) => {
		if (barb[2] >= minX && barb[2] <= maxX && barb[3] >= minY && barb[3] <= maxY) {
			barbsInsidePlayerRadius.push(barb);
		}
	});

	return barbsInsidePlayerRadius;
}

// Helper: Get Barbarian Villages Coords Array
function getBarbCoords(barbsInsidePlayerRadius) {
	var barbCoords = [];
	barbsInsidePlayerRadius.forEach((barb) => {
		barbCoords.push(barb[2] + '|' + barb[3]);
	});
	return barbCoords;
}

// Helper: Get Boundary Coords for the Player
function getPlayerBoundaryCoords(playerVills, radius) {
	let coordsX = [];
	let coordsY = [];

	playerVills.forEach((village) => {
		coordsX.push(village[2]);
		coordsY.push(village[3]);
	});

	let minX = Math.min(...coordsX);
	let minY = Math.min(...coordsY);
	let maxX = Math.max(...coordsX);
	let maxY = Math.max(...coordsY);

	let minFinalX = minX - radius;
	let minFinalY = minY - radius;
	let maxFinalX = maxX + radius;
	let maxFinalY = maxY + radius;

	return [minFinalX, minFinalY, maxFinalX, maxFinalY];
}

// Helper: Scout Script Generator
function generateScoutScript(barbsList) {
	return `javascript:coords='${barbsList}';var doc=document;if(window.frames.length>0 && window.main!=null)doc=window.main.document;url=doc.URL;if(url.indexOf('screen=place')==-1)alert('Use the script in the rally point page!');coords=coords.split(' ');index=0;farmcookie=document.cookie.match('(^|;) ?farm=([^;]*)(;|$)');if(farmcookie!=null)index=parseInt(farmcookie[2]);if(index>=coords.length)alert('All villages were extracted, now start from the first!');if(index>=coords.length)index=0;coords=coords[index];coords=coords.split('|');index=index+1;cookie_date=new Date(2021,3,27);document.cookie ='farm='+index+';expires='+cookie_date.toGMTString();doc.forms[0].x.value=coords[0];doc.forms[0].y.value=coords[1];$('#place_target').find('input').val(coords[0]+'|'+coords[1]);doc.forms[0].spy.value=1;`;
}

//Helper: Convert CSV data into Array
function CSVToArray(strData, strDelimiter) {
	strDelimiter = strDelimiter || ',';
	var objPattern = new RegExp(
		'(\\' + strDelimiter + '|\\r?\\n|\\r|^)' + '(?:"([^"]*(?:""[^"]*)*)"|' + '([^"\\' + strDelimiter + '\\r\\n]*))',
		'gi'
	);
	var arrData = [[]];
	var arrMatches = null;
	while ((arrMatches = objPattern.exec(strData))) {
		var strMatchedDelimiter = arrMatches[1];
		if (strMatchedDelimiter.length && strMatchedDelimiter !== strDelimiter) {
			arrData.push([]);
		}
		var strMatchedValue;

		if (arrMatches[2]) {
			strMatchedValue = arrMatches[2].replace(new RegExp('""', 'g'), '"');
		} else {
			strMatchedValue = arrMatches[3];
		}
		arrData[arrData.length - 1].push(strMatchedValue);
	}
	return arrData;
}

// Helper: Generates script info
function scriptInfo() {
	return `[${scriptData.name} ${scriptData.version}]`;
}

// Helper: Prepare Popup Content
function preparePopupContent(popupBody, minWidth = '340px', maxWidth = '360px') {
	const popupHeader = `
		<h3 class="ra-fs18 ra-fw600">
			${tt(scriptData.name)}
		</h3>
		<div class="ra-body">`;
	const popupFooter = `</div><small><strong>${tt(scriptData.name)} ${scriptData.version}</strong> - <a href="${
		scriptData.authorUrl
	}" target="_blank" rel="noreferrer noopener">${scriptData.author}</a> - <a href="${
		scriptData.helpLink
	}" target="_blank" rel="noreferrer noopener">${tt('Help')}</a></small>`;
	const popupStyle = `
		<style>
			.popup_box_content { overflow-y: hidden; }
			.ra-body { width: 100%; min-width: ${minWidth}; max-width: ${maxWidth}; box-sizing: border-box; }
			.ra-fs12 { font-size: 12px; }
			.ra-fs16 { font-size: 16px; }
			.ra-fs18 { font-size: 18px; }
			.ra-fw600 { font-weight: 600; }
			.ra-mb10 { margin-bottom: 10px; }
			.ra-mb15 { margin-bottom: 15px; }
			.ra-tac { text-align: center; }
			.ra-textarea { width: 100%; height: 80px; box-sizing: border-box; padding: 5px; resize: none; }
			.ra-textarea:focus { box-shadow: none; outline: none; border: 1px solid #000; background-color: #eee; }
			.ra-table { border-spacing: 2px; border-collapse: separate; margin-bottom: 5px; border: 2px solid #f0e2be; }
			.ra-table th { text-align: center; }
            .ra-table td { padding: 1px 2px; }
            .ra-table td a { word-break: break-all; }
			.ra-table tr:nth-of-type(2n) td { background-color: #f0e2be }
			.ra-table tr:nth-of-type(2n+1) td { background-color: #fff5da; }
			.ra-form-control { font-size: 12px; padding: 4px; width: 100%; box-sizing: border-box; }
			.ra-flex { display: flex; flex-flow: row wrap; justify-content: space-between; }
			.ra-flex-6 { flex: 0 0 48%; }
			.ra-flex-4 { flex: 0 0 30.5%; }
		</style>
	`;

	let popupContent = `
		${popupHeader}
		${popupBody}
		${popupFooter}
		${popupStyle}
	`;

	return popupContent;
}

// Helper: Prints universal debug information
function initDebug() {
	console.debug(`${scriptInfo()} It works 🚀!`);
	console.debug(`${scriptInfo()} HELP:`, scriptData.helpLink);
	if (DEBUG) {
		console.debug(`${scriptInfo()} Market:`, game_data.market);
		console.debug(`${scriptInfo()} World:`, game_data.world);
		console.debug(`${scriptInfo()} Screen:`, game_data.screen);
		console.debug(`${scriptInfo()} Game Version:`, game_data.majorVersion);
		console.debug(`${scriptInfo()} Game Build:`, game_data.version);
		console.debug(`${scriptInfo()} Locale:`, game_data.locale);
		console.debug(`${scriptInfo()} Premium:`, game_data.features.Premium.active);
	}
}

// Helper: Text Translator
function tt(string) {
	const gameLocale = game_data.locale;

	if (translations[gameLocale] !== undefined) {
		return translations[gameLocale][string];
	} else {
		return translations['en_DK'][string];
	}
}

// Helper: Translations Notice
function initTranslationsNotice() {
	const gameLocale = game_data.locale;

	if (translations[gameLocale] === undefined) {
		UI.ErrorMessage(
			`No translation found for <b>${gameLocale}</b>. <a href="${scriptData.helpLink}" class="btn" target="_blank" rel="noreferrer noopener">Add Yours</a> by replying to the thread.`,
			4000
		);
	}
}
