package com.kayakcrasher.calendario.entities;

import io.objectbox.annotation.Entity;
import io.objectbox.annotation.Id;

@Entity
public class Grocery {
    @Id public long id;
    public String uuid;
    public String name;
    public String quantity;
    public String category;
    public boolean purchased;
    public Long addedByProfileId;
    public long createdAt;
}
