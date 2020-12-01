/* global gcbEditor */

/**
 * WordPress dependencies
 */
import { useDispatch, useSelect } from '@wordpress/data';
import { useCallback } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import { getBlock, getNewFieldNumber, getOtherLocation, setCorrectOrderForFields } from '../helpers';
import { getFieldsAsArray, getFieldsAsObject } from '../../common/helpers';

/**
 * @typedef {Object} UseFieldReturn The return value of useField.
 * @property {Function} addNewField Adds a new field.
 * @property {Object} controls All of the possible controls.
 * @property {Function} deleteField Deletes this field.
 * @property {Function} changeControl Changes the control of the field.
 * @property {Function} changeFieldSettings Changes field settings.
 * @property {Function} getField Gets the selected field.
 * @property {Function} getFieldsForLocation Gets all of the fields for a given location.
 * @property {Function} reorderFields Reorders the fields for a given location.
 */

/**
 * Gets the field context.
 *
 * @return {UseFieldReturn} The field context and functions to change it.
 */
const useField = () => {
	// @ts-ignore
	const { controls } = gcbEditor;
	const editedPostContent = useSelect(
		( select ) => select( 'core/editor' ).getEditedPostContent(),
		[]
	);

	const getFullBlock = useCallback(
		() => getBlock( editedPostContent ),
		[ editedPostContent ]
	);

	const fullBlock = getFullBlock();
	const { editPost } = useDispatch( 'core/editor' );
	const blockNameWithNameSpace = Object.keys( fullBlock )[ 0 ];
	const block = fullBlock[ blockNameWithNameSpace ];

	/**
	 * Changes a field name (slug), and returns the fields.
	 *
	 * Each field is accessed in fields with a key of its name.
	 * So renaming a field involves changing that key
	 * and the field's name property.
	 *
	 * @param {Object} fields The fields from which to rename a field.
	 * @param {string} previousName The previous field name (slug).
	 * @param {string} newName The new field name (slug).
	 * @return {Object} The fields with the field renamed.
	 */
	const changeFieldName = ( fields, previousName, newName ) => {
		const renamedField = { ...fields[ previousName ], name: newName };
		fields[ newName ] = renamedField;
		delete fields[ previousName ];
		return fields;
	};

	/**
	 * Adds a new field to the end of the existing fields.
	 *
	 * @param {string} location The location to add the field to.
	 */
	const addNewField = useCallback( ( location ) => {
		const { fields = {} } = fullBlock[ blockNameWithNameSpace ];
		const newFieldNumber = getNewFieldNumber( fields );
		const newFieldName = newFieldNumber
			? `new-field-${ newFieldNumber.toString() }`
			: 'new-field';
		const label = newFieldNumber
			? sprintf(
				// translators: %s: the field number
				__( 'New Field %s', 'genesis-custom-blocks' ),
				newFieldNumber.toString()
			)
			: __( 'New Field', 'genesis-custom-blocks' );

		const newField = {
			name: newFieldName,
			location,
			label,
			control: 'text',
			type: 'string',
			order: Object.values( fields ).length,
		};

		fields[ newFieldName ] = newField;
		fullBlock[ blockNameWithNameSpace ].fields = fields;

		editPost( { content: JSON.stringify( fullBlock ) } );
	}, [ blockNameWithNameSpace, editPost, fullBlock ] );

	/**
	 * Changes the control of a field.
	 *
	 * @param {string} newControlName The name of the control to change to.
	 */
	const changeControl = useCallback( ( fieldName, newControlName ) => {
		const newControl = controls[ newControlName ];
		if ( ! newControl || ! fieldName ) {
			return;
		}

		if ( ! fullBlock[ blockNameWithNameSpace ].fields ) {
			fullBlock[ blockNameWithNameSpace ].fields = [];
		}

		const previousField = fullBlock[ blockNameWithNameSpace ].fields[ fieldName ];
		const newField = {
			name: previousField.name,
			label: previousField.label,
			control: newControl.name,
			type: newControl.type,
		};

		fullBlock[ blockNameWithNameSpace ].fields[ fieldName ] = newField;
		editPost( { content: JSON.stringify( fullBlock ) } );
	}, [ blockNameWithNameSpace, controls, editPost, fullBlock ] );

	/**
	 * Gets a field, if it exists.
	 *
	 * @param {string} fieldName The name of the field.
	 * @return {Object} The field, or {}.
	 */
	const getField = useCallback( ( fieldName ) => {
		return fieldName ? block.fields[ fieldName ] : {};
	}, [ block ] );

	/**
	 * Gets the fields for either the editor or inspector.
	 *
	 * @param {string} location The location, like 'editor', or 'inspector'.
	 * @return {Array} The fields with the given location.
	 */
	const getFieldsForLocation = useCallback( ( location ) => {
		if ( ! block || ! block.fields ) {
			return null;
		}

		return getFieldsAsArray( block.fields ).filter( ( field ) => {
			if ( 'editor' === location ) {
				return ! field.location || 'editor' === field.location;
			}

			return field.location === 'inspector';
		} );
	}, [ block ] );

	/**
	 * Moves a field to another location, and sets the correct order properties.
	 *
	 * @param {number} moveFrom The index of the field to move.
	 * @param {number} moveTo The index that the field should be moved to.
	 * @param {string} currentLocation The current field's location, like 'editor'.
	 */
	const changeFieldLocation = useCallback( ( fields, fieldName, newLocation ) => {
		const fieldToMove = fields[ fieldName ];
		const previousLocation = fieldToMove.location;

		const previousLocationFields = getFieldsForLocation( previousLocation );
		const fieldsWithoutMovedField = previousLocationFields.filter( ( field ) => {
			return field.name !== fieldName;
		} );

		const newLocationFields = getFieldsForLocation( newLocation );
		newLocationFields.push( fieldToMove );

		return getFieldsAsObject( [
			...setCorrectOrderForFields( fieldsWithoutMovedField ),
			...setCorrectOrderForFields( newLocationFields ),
		] );
	}, [ getFieldsForLocation ] );

	/**
	 * Changes a field setting.
	 *
	 * @param {string} settingKey The key of the setting, like 'label' or 'placeholder'.
	 * @param {any} newSettingValue The new setting value.
	 */
	const changeFieldSettings = useCallback( ( fieldName, newSettings ) => {
		if ( newSettings.location ) {
			fullBlock[ blockNameWithNameSpace ].fields = changeFieldLocation(
				fullBlock[ blockNameWithNameSpace ].fields,
				fieldName,
				newSettings.location
			);
		}

		if ( newSettings.name ) {
			fullBlock[ blockNameWithNameSpace ].fields = changeFieldName(
				fullBlock[ blockNameWithNameSpace ].fields,
				fieldName,
				newSettings.name
			);
		}

		const field = fullBlock[ blockNameWithNameSpace ].fields[ fieldName ];
		fullBlock[ blockNameWithNameSpace ].fields[ fieldName ] = {
			...field,
			...newSettings,
		};

		editPost( { content: JSON.stringify( fullBlock ) } );
	}, [ blockNameWithNameSpace, changeFieldLocation, editPost, fullBlock ] );

	/**
	 * Reorders fields, moving a single field to another position.
	 *
	 * @param {number} moveFrom The index of the field to move.
	 * @param {number} moveTo The index that the field should be moved to.
	 * @param {string} currentLocation The current field's location, like 'editor'.
	 */
	const reorderFields = useCallback( ( moveFrom, moveTo, currentLocation ) => {
		const fieldsToReorder = getFieldsForLocation( currentLocation );
		if ( ! fieldsToReorder.length ) {
			return;
		}

		const newFields = [ ...fieldsToReorder ];
		[ newFields[ moveFrom ], newFields[ moveTo ] ] = [ newFields[ moveTo ], newFields[ moveFrom ] ];

		fullBlock[ blockNameWithNameSpace ].fields = getFieldsAsObject( [
			...setCorrectOrderForFields( newFields ),
			...getFieldsForLocation( getOtherLocation( currentLocation ) ),
		] );
		editPost( { content: JSON.stringify( fullBlock ) } );
	}, [ blockNameWithNameSpace, editPost, fullBlock, getFieldsForLocation ] );

	/**
	 * Deletes this field.
	 */
	const deleteField = useCallback( ( fieldName ) => {
		delete fullBlock[ blockNameWithNameSpace ].fields[ fieldName ];
		editPost( { content: JSON.stringify( fullBlock ) } );
	}, [ blockNameWithNameSpace, editPost, fullBlock ] );

	return {
		addNewField,
		controls,
		deleteField,
		getField,
		getFieldsForLocation,
		changeControl,
		changeFieldSettings,
		reorderFields,
	};
};

export default useField;
