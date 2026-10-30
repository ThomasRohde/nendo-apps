"Slip kernel: the bridge to the Nendo file Slip runs in. Nendo reads and writes the file's
records; Slip keeps an object on purpose, as STON text in an st.object record, so it is there
when Slip opens again. Each request waits for Nendo's answer: the rest of the page goes on."!

!Nendo class methodsFor: 'records'!
entities
	"The IDs of the file's record types."
	^self request: #entities with: #()
!
records: entityId
	"Every record of a record type, as NendoRecords."
	^self request: #records with: {entityId}
!
create: entityId values: aDictionary
	"A new record, from a Dictionary of field IDs and values."
	^self request: #create with: {entityId. aDictionary}
!
update: aNendoRecord values: aDictionary
	"Changes the fields aDictionary names. Answers the record as it now is."
	^self request: #update with: {aNendoRecord. aDictionary}
!
delete: aNendoRecord
	^self request: #delete with: {aNendoRecord}
! !

!Nendo class methodsFor: 'private'!
request: aSymbol with: anArray
	<primitive: 'nendoRequest'>
	^self error: 'Slip reaches Nendo only from a run in the Workspace.'
! !

!NendoRecord methodsFor: 'accessing'!
entityId
	^entityId
!
recordId
	^recordId
!
version
	^version
!
values
	^values
!
at: aFieldId
	^values at: aFieldId ifAbsent: [nil]
! !

!NendoRecord methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'a NendoRecord('; nextPutAll: entityId; nextPutAll: ' '; nextPutAll: recordId; nextPut: $)
! !

!Slip class methodsFor: 'keeping objects'!
keep: anObject as: aName
	"Keeps anObject in the file as aName, written as STON. Answers anObject."
	^Nendo request: #keep with: {aName asString. anObject}
!
kept: aName
	"A new copy of the object kept as aName."
	^Nendo request: #kept with: {aName asString}
!
keptNames
	^Nendo request: #keptNames with: #()
!
forget: aName
	"Removes the object kept as aName. Answers whether there was one."
	^Nendo request: #forget with: {aName asString}
! !
